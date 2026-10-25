"""Build the clean `dvl` repository from the original spike git history plus
every desktop package, one commit + tag per version. Read-only on the inputs.

usage: python3 -I build_dvl_repo.py <spike_clone> <out_repo> <manifest_json>
"""
import hashlib, json, os, shutil, subprocess, sys, zipfile, datetime

SPIKE, OUT, MANIFEST = sys.argv[1], sys.argv[2], sys.argv[3]
U = "/root/.claude/uploads/67994ecf-6eff-5ff8-a525-d7b634646c78/"
M = "/mnt/user-data/uploads/dvl-dsktop/"

# (zip, target dir in repo, tag, status label, commit title)
DESKTOP = [
    (U + "22e92f9a-dvl-desktop-B10-workspace-panels-v1.zip", "dvl-desktop", "desktop/B10-workspace-panels-v1", "HISTORICAL", "B10 workspace panels v1"),
    (U + "094933d6-DVL_GREEN_GATE_B_REVIEW_v1.zip", "dvl-desktop", "desktop/B-green-gate-review-v1", "HISTORICAL", "Green Gate B review v1"),
    (U + "45071bee-DVL_GREEN_GATE_B_REPAIR_v2.zip", "dvl-desktop", "desktop/B-repair-v2", "SUPERSEDED", "Green Gate B repair v2"),
    (U + "454bcbd4-DVL_B_FINAL_REVIEW_v1.zip", "dvl-desktop", "desktop/B-final-review-v1", "SUPERSEDED", "B final review v1"),
    (U + "4b8148b0-DVL_GREEN_GATE_B_REPAIR_v3.zip", "dvl-desktop", "desktop/B-repair-v3-FROZEN", "PASS/FROZEN", "Phase B repair v3 — GREEN/FROZEN baseline"),
    (U + "a54ae970-DVL_C1A_BOUNDARY_CANDIDATE_V0_1.zip", "dvl-desktop", "desktop/C1a-boundary-v0.1", "SUPERSEDED", "C1a boundary candidate v0.1"),
    (U + "d5533400-DVL_C1A_REPAIR_V2.zip", "dvl-desktop", "desktop/C1a-repair-v2-DRAFT", "SUPERSEDED (string-escaped Seatbelt profile; not the reviewed reader.c)", "C1a repair v2 — early draft (superseded 14 min later)"),
    (U + "c2d4a229-dvl-desktop-C1a-repair-v2.zip", "dvl-desktop", "desktop/C1a-repair-v2", "scoped PASS, NOT frozen; F1/N-2 reopened by C1B-UNICODE-01", "C1a repair v2 — reviewed reader (sandbox_init_with_parameters)"),
    (U + "43bb6171-DVL_C1B_CANDIDATE_V1.zip", "dvl-desktop", "desktop/C1b-v1", "NOT PASS", "C1b candidate V1"),
    (U + "e39c943c-DVL_C1B_CANDIDATE_V2.zip", "dvl-desktop", "desktop/C1b-v2", "SUPERSEDED (Unicode ligature aliases)", "C1b candidate V2"),
    (U + "e724591c-DVL_C1B_CANDIDATE_V3.zip", "dvl-desktop", "desktop/C1b-v3", "SUPERSEDED by R1 (auth tests)", "C1b candidate V3"),
    (M + "DVL_C1B_V3_AUTH_TESTS_R1.zip", "dvl-desktop", "desktop/C1b-v3-auth-r1", "CANDIDATE — automated Mac qualification PASS; 0/5 launches; NOT frozen", "C1b V3 auth-tests R1 — current candidate"),
]
KITS = {  # attached at the commit of the version they belong to
    "desktop/C1b-v2": [(U + "59b84d27-DVL_C1B_V2_PRE_MAC_KIT.zip", "kits/C1b-v2-pre-mac-kit"),
                       (U + "6b520f96-DVL_C1B_UNICODE_ALIAS_PROBE_1.zip", "kits/C1b-unicode-alias-probe-1")],
    "desktop/C1b-v3": [(U + "8dee51db-DVL_C1B_V3_PRE_MAC_KIT.zip", "kits/C1b-v3-pre-mac-kit")],
    "desktop/C1b-v3-auth-r1": [(M + "DVL_C1B_V3_AUTH_TESTS_R1_KIT_R2.zip", "kits/C1b-r1-kit-r2")],
}
EVIDENCE = {
    "desktop/C1b-v2": [(M + "C1B_V2_MAC_QUALIFICATION.log", "evidence/mac/C1b-v2/C1B_V2_MAC_QUALIFICATION.log"),
                       (M + "C1B_UNICODE_ALIAS_PROBE.json", "evidence/mac/C1b-v2/C1B_UNICODE_ALIAS_PROBE.json"),
                       (M + "C1B_UNICODE_ALIAS_PROBE_REPAIR1.json", "evidence/mac/C1b-v2/C1B_UNICODE_ALIAS_PROBE_REPAIR1.json")],
    "desktop/C1b-v3-auth-r1": [(M + "C1B_V3_R1_MAC_EVIDENCE/" + f, "evidence/mac/C1b-r1/" + f) for f in
                               ("qualification.log", "unicode-aliases-v3.json", "SHA256SUMS.txt", "capture-status.txt")],
}
SKIP_PARTS = {"__MACOSX", "node_modules", ".DS_Store"}

def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""): h.update(b)
    return h.hexdigest()

def git(*a, env=None):
    return subprocess.run(["git", "-C", OUT, *a], check=True, capture_output=True, text=True, env=env).stdout.strip()

def extract(zpath, target):
    """Extract zip into target, stripping a single top-level folder if present.
    Skips macOS metadata, node_modules and compiled helper binaries (bin/)."""
    dest = os.path.join(OUT, target)
    if os.path.exists(dest): shutil.rmtree(dest)
    os.makedirs(dest)
    z = zipfile.ZipFile(zpath)
    names = [n for n in z.namelist() if not set(n.split("/")) & SKIP_PARTS and not n.endswith("/")]
    tops = {n.split("/")[0] for n in names}
    strip = len(tops) == 1 and all("/" in n for n in names)
    files, skipped, latest = [], [], None
    for info in z.infolist():
        n = info.filename
        if n not in names: continue
        rel = n.split("/", 1)[1] if strip else n
        parts = rel.split("/")
        if parts[0] == "bin":
            skipped.append(rel); continue
        if ".." in parts or rel.startswith("/"): raise SystemExit("unsafe path " + n)
        out = os.path.join(dest, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with z.open(info) as src, open(out, "wb") as dst: shutil.copyfileobj(src, dst)
        files.append(rel)
        d = datetime.datetime(*info.date_time)
        latest = d if latest is None or d > latest else latest
    return files, skipped, latest

def main():
    if os.path.exists(OUT): raise SystemExit("output exists: " + OUT)
    subprocess.run(["git", "clone", "-q", "--no-local", SPIKE, OUT], check=True)
    git("fetch", "-q", "origin", "+refs/remotes/origin/*:refs/remotes/origin/*")
    git("checkout", "-q", "-B", "main", "origin/etape0/frozen-baseline")
    for ref, name in (("origin/main", "archive/spike-main-H3"), ("origin/claude/sweet-curie-6o0u3u", "archive/spike-h4-claude-branch-unmerged")):
        git("branch", "-f", name, ref)
    git("tag", "-a", "spike/H4-d92d063", "d92d063", "-m", "H4 candidate certified on macOS (two full-suite passes, see 05eef68)")
    git("tag", "-a", "spike/H3-main", "origin/main", "-m", "Spike main as of H3 closure")
    git("tag", "-a", "spike/H4-evidence-05eef68", "05eef688102bf43e80e37cc024fa2169b1b8e850", "-m", "H4 evidence child: READY_FOR_FINAL_H4_CLOSURE_DECISION")
    git("tag", "-a", "spike/ETAPE0-FROZEN-ae13301", "ae13301b8794889d33b3fdab08a85d99aa0e0b7a", "-m", "ETAPE 0 PASS FROZEN baseline (DVL_ETAPE_00_BASELINE_PASS.md). Commit reconstructed byte-exact on 2026-10-25 from the 0.G working-tree fixes; SHA-1 matches the recorded hash.")
    git("remote", "remove", "origin")
    manifest = {"spike_base": git("rev-parse", "HEAD"), "versions": []}
    for zpath, target, tag, status, title in DESKTOP:
        files, skipped, latest = extract(zpath, target)
        entry = {"tag": tag, "status": status, "source_zip": os.path.basename(zpath).split("-", 1)[-1] if zpath.startswith(U) else os.path.basename(zpath),
                 "source_zip_sha256": sha(zpath), "files": len(files), "skipped_binaries": skipped,
                 "package_date": latest.isoformat() if latest else None, "kits": [], "evidence": []}
        for kz, kt in KITS.get(tag, []):
            kf, ks, _ = extract(kz, kt)
            entry["kits"].append({"path": kt, "source_zip_sha256": sha(kz), "files": len(kf)})
        for src, dst in EVIDENCE.get(tag, []):
            os.makedirs(os.path.dirname(os.path.join(OUT, dst)), exist_ok=True)
            shutil.copyfile(src, os.path.join(OUT, dst))
            entry["evidence"].append({"path": dst, "sha256": sha(src)})
        git("add", "-A")
        env = dict(os.environ, GIT_AUTHOR_NAME="Bacem", GIT_AUTHOR_EMAIL="frridhibassem@gmail.com")
        if latest:
            env["GIT_AUTHOR_DATE"] = latest.strftime("%Y-%m-%dT%H:%M:%S+02:00")
        msg = f"{title}\n\nStatus: {status}\nSource package: {entry['source_zip']}\nSource SHA-256: {entry['source_zip_sha256']}\nImported verbatim (macOS metadata, node_modules and compiled bin/ helpers excluded).\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_015FhZtkwaXBTL65UAR8VWN5"
        subprocess.run(["git", "-C", OUT, "commit", "-q", "--allow-empty", "-m", msg], check=True, env=env)
        git("tag", "-a", tag, "-m", f"{title} — {status}")
        entry["commit"] = git("rev-parse", "HEAD")
        manifest["versions"].append(entry)
    json.dump(manifest, open(MANIFEST, "w"), indent=2, ensure_ascii=False)

main()
