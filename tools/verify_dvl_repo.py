"""Independent identity check: for every desktop tag, every file in the source
zip (minus excluded metadata/binaries) must exist in the tagged tree with
identical bytes, and the tree must contain nothing extra under that folder.
usage: python3 -I verify_dvl_repo.py <repo> <manifest_json>"""
import json, subprocess, sys, zipfile, hashlib
REPO, MAN = sys.argv[1], sys.argv[2]
U = "/root/.claude/uploads/67994ecf-6eff-5ff8-a525-d7b634646c78/"
M = "/mnt/user-data/uploads/dvl-dsktop/"
SKIP = {"__MACOSX", "node_modules", ".DS_Store"}

def tree(tag, prefix):
    out = subprocess.run(["git", "-C", REPO, "ls-tree", "-r", tag, "--", prefix + "/"], capture_output=True, text=True, check=True).stdout
    res = {}
    for line in out.splitlines():
        meta, path = line.split("\t", 1)
        res[path[len(prefix) + 1:]] = meta.split()[2]
    return res

def blob_hash(data):
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()

def zip_files(path):
    z = zipfile.ZipFile(path)
    names = [n for n in z.namelist() if not set(n.split("/")) & SKIP and not n.endswith("/")]
    tops = {n.split("/")[0] for n in names}
    strip = len(tops) == 1 and all("/" in n for n in names)
    res = {}
    for n in names:
        rel = n.split("/", 1)[1] if strip else n
        if rel.split("/")[0] == "bin": continue
        res[rel] = blob_hash(z.read(n))
    return res

man = json.load(open(MAN))
ok = True
for v in man["versions"]:
    src = v["source_zip"]
    path = (M + src) if src.startswith("DVL_C1B_V3_AUTH") else next(
        U + f for f in __import__("os").listdir(U) if f.split("-", 1)[-1] == src)
    checks = [(path, "dvl-desktop")] + [(None, k["path"]) for k in v["kits"]]
    z, t = zip_files(path), tree(v["tag"], "dvl-desktop")
    missing = sorted(set(z) - set(t)); extra = sorted(set(t) - set(z))
    diff = sorted(p for p in set(z) & set(t) if z[p] != t[p])
    status = "OK" if not (missing or extra or diff) else "MISMATCH"
    ok &= status == "OK"
    print(f"{v['tag']:32s} {status} files={len(z)} missing={missing[:5]} extra={extra[:5]} diff={diff[:5]}")
print("ALL_TAGS_IDENTICAL" if ok else "IDENTITY_FAILURE")
sys.exit(0 if ok else 1)
