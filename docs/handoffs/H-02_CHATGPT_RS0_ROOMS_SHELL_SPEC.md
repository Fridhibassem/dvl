# H-02 — Spec: RS-0 "Rooms shell, read-only" (specification only, no code)

**Lane:** ChatGPT (spec and context). Code comes later from Claude Code or Codex,
and only after C1b PASS.
**From:** Claude, continuity lead · 2026-10-25 · Decision D-09 (reversible; the owner may veto)
**Return:** a spec document to the owner, who passes it to the lead.

## Why

DVL's differentiator is the Dynamic Project Environment (Rooms). Today only
the four static panels from Phase B exist, and full Rooms sit at plan step [37].
RS-0 makes the Room experience visible early, **without adding any authority**.
It must not come before the Kernel and mutation work in a way that breaks D-04.

## Context to use

- Product baseline: `docs/sources/product/DVL_MASTER_PROJECT_STATE_V1_EN.md` §3–4, 7, 9, 12, 13
  (semi-circle layout, Room names above, click to bring forward inside the
  environment, sidebar with Settings, Providers, Skills, Toolbox).
- Owner's visual reference: `docs/sources/product/DVL_ROOMS_VISUAL_REFERENCE_2026-10-25.jpg` (DVL core cube in the centre, Rooms as curved glass panels around it). The layout question is P-04. Owner decision D-14: Rooms are clickable, and clicking a Room brings it to the front.
- Frozen B baseline (tag `desktop/B-repair-v3-FROZEN`) and the current candidate C1b R1.
- The frozen-B harness rule: B's 24 tests stay unchanged except approved harness adaptations.

## The spec must define

1. Room layout and switching behaviour; what each Room shows in RS-0:
   - **Meeting/Chat**: UI only, no provider.
   - **Live Task**: real reader activity, meaning the C1b list, search progress, Stop and partial results.
   - **Live Product**: the opened project, read-only, as a file and static content view only. It must **never launch a dev server or execute project HTML/JS**; the executable preview belongs to [13]. Define the exact viewer behaviour (A-02 Q6).
   - **Design**: placeholder.
2. Whether and how the Rooms vary by project type in RS-0 (it may be "not yet").
3. **Security boundary.** Every new IPC channel (ideally none) must pass the same
   sender/frame authentication as the 9 B channels, with the 10 negative scenarios
   from R1. There must be no new main-process authority, no writes, no `.dvl`
   and no RootLock.
4. Acceptance gate:
   - B 24/24 and all C1b suites still pass.
   - Auth tests are extended to any new channel.
   - Accessibility basics (keyboard switching, focus).
   - Behaviour on 8 GB / Intel.
   - Owner visual acceptance on the Mac.
5. Explicit non-goals, and the risks or open questions for the owner.

## Out of scope

Code, mockups that claim to be implementation, provider calls, mutation,
changing B or C1b source.
