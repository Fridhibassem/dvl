# H-03 — Spec: Rooms by project type, Database Room, outer sidebar (Providers / Skills / Toolbox)

**Lane:** ChatGPT (specification only, no code). Claude Code or Codex implement later (D-07).
**From:** Claude, continuity lead · 2026-10-25
**Return:** a spec document to the owner, who passes it to the lead.

## Owner decisions to follow (do not reopen them)

- D-13: the user cannot add, remove or hide Rooms; DVL decides.
- D-14 / D-15: Rooms are clickable. Only the clicked Room comes forward and
  covers what is behind it. An X returns it to its place. The ring does not rotate.
- D-16: the Room set differs by project type; a project that needs a database
  gets a Database Room.
- D-17: the sidebar is the app's outer sidebar (like Codex or Claude desktop):
  Settings, Providers, Skills, Toolbox. There are multiple providers with roles
  (code, review, security, design). Skills belong to a specific provider. The
  Design Room is design only, never code.
- D-18: full circle vs half-circle is decided later by prototyping.
- D-19: all four sidebar items are visible in the MVP, but only implemented
  parts are active (labelled honestly). The MVP uses one provider;
  multi-provider roles come at [33] and skills/toolbox at [36].

## The spec must define

1. **Type → Rooms table** for web app, mobile app, website, presentation,
   visual product, and a fallback type. For each Room: why it exists for that
   type and what it shows. Also how DVL detects the type, and what happens when
   the type is uncertain or changes during the project. Remember that D-13
   forbids user add/remove.
2. **Database Room:**
   - What triggers it.
   - Views: schema map, test-data browser (read-only), migrations, health.
   - Never shows secrets; never shows production data by default.
   - Every change goes through task → worker → test → verification.
   - What it may show before [09]–[13] exist, if anything.
3. **Providers model:**
   - Connecting several providers (credentials in secure storage only).
   - Assigning roles (code, review, security, design).
   - How a role maps to Task / Assignment / Worker. A role is not authority;
     the Kernel decides.
   - The independence rule: a reviewer is not the author.
   - What happens when a provider is missing or hits a limit.
4. **Skills model:**
   - Per-provider skills.
   - Install, version, provenance.
   - Skill text never enlarges authority (roadmap [36]).
5. **Toolbox:** what it contains in the MVP versus later.
6. **MVP vs later**, item by item, consistent with D-19 and the honesty rule
   (never show unimplemented capability as working).
7. Open questions for the owner, with options and a recommendation.

## Sources

- `docs/MASTER_STATE.md` §0 (product identity and visual reference)
- `docs/DECISIONS.md` D-13..D-19
- product baseline §§3–6, 11–17
- contract V0.3.2 §§22, 29, 40–42
- roadmap V2 [17], [18], [33], [36], [37]
- A-02

## Out of scope

Code, provider selection, changing frozen B or C1b.
