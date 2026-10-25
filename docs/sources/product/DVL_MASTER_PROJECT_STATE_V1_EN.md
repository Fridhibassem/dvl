# DVL --- MASTER PROJECT STATE

## Product Vision & Experience --- Locked Baseline V1

**Purpose:** Freeze the DVL product idea from the user's point of view
before technical architecture. This document defines the product
experience; runtime, authorization, Kernel/Harness, scheduling, storage,
recovery, provider APIs, and other engineering mechanisms are
deliberately deferred.

## 1. DVL at its core

DVL is first a **complete Coding Agent**. A user can say "Build me this
website," "Add authentication," or "Build according to this uploaded
plan," and DVL builds or modifies the project. It is not merely an
orchestrator, dashboard, design tool, verification system, or project
manager.

## 2. Projects

The user can own one or many projects. **New Project** asks for a
project name and short description, with optional plans, requirements,
files, screenshots, images, references, documents, or existing source.
DVL must not require technical expertise just to begin.

## 3. Dynamic Project Environment

After creation, DVL understands the project type---web app, mobile app,
website, presentation, visual product, or another type---and creates an
appropriate **Dynamic Project Environment**. Rooms may differ by project
type.

The environment is where the user talks, observes work, designs,
intervenes, follows progress, and experiences the running product.

## 4. Visual language

Rooms sit side-by-side with a subtle **semi-circle / demi-circle**
spatial feeling and light depth. Each Room has its name above it.
Clicking a Room brings it forward and enlarges it **inside the
environment**, without necessarily taking over the whole laptop screen.

Core Rooms include: - Meeting / Chat Room - Live Task Room - Design
Room - Live Product Room

A fixed Sidebar initially includes **Settings, Providers, Skills, and
Toolbox**. More items may be added only when useful.

## 5. Providers and Roles

Providers are configured per project. The user may assign, for
example: - Claude → Code / Implementation - Codex → Code Review - Kimi →
Security - Gemini → Design

Roles are not permanently hard-coded to providers. The user chooses the
responsibility structure for each project and applies it.

## 6. Orchestrator and Workers

The **DVL Orchestrator** coordinates who does what, what can safely run
in parallel, what depends on other work, what must wait, and what
requires review or verification.

**Parallel where possible. Coordinated where necessary.**

One provider can power multiple independent **Sub-agents / Workers**.
For example, separate workers may handle Homepage, Authentication UI,
API, and Database Schema. Worker count is dynamic, not fixed.

## 7. Meeting / Chat Room

Natural conversation remains central. The user can say "Build this,"
"Change this," "Why did you do this?" or change project direction while
work is running.

A consequential change such as "Replace MySQL with SQL Server" must be
understood as a project change. Accepted changes propagate coherently to
affected ongoing work. Exact authorization and replanning mechanics are
engineering responsibilities.

## 8. Authorization principle

DVL should request human authorization when meaningful authority is
genuinely required, but must not interrupt the user for every harmless
operation. Detailed authorization rules are part of the later technical
architecture.

## 9. Live Task Room

The Live Task Room may show an overview such as Frontend RUNNING,
Backend RUNNING, Database RUNNING, Tests WAITING, Review WAITING,
Security WAITING.

But **RUNNING is not enough**.

Clicking a task must reveal what the Agent is **actually doing now**. If
at 10:00 it is creating `users`, the state may say
`NOW — Creating users table`. If ten seconds later it has moved to
`products`, the user must see `NOW — Creating products table`.

Possible real transitions: - Creating users table - Creating products
table - Creating relationships - Generating migration - Applying
migration - Validating migration - Running database tests

Or: - Creating Login component - Adding validation - Updating styles -
Running test - Fixing failure - Running test again

This is **live execution visibility**, not a fake animation, stale log,
decorative progress bar, or occasional summary. Every active Worker/Task
has its own live state.

## 10. Work Survival

The Agent is not the project. Agent crash, provider failure, internet
interruption, DVL interruption, computer interruption, or session
failure must not erase completed project work.

Core law:

> **Worker can die. Work survives.**

Work belongs to the project workspace on the user's machine rather than
existing only in temporary Agent memory. When execution returns, DVL
should understand completed work and safely continue from the
appropriate point. Checkpointing and recovery mechanisms are technical
decisions.

## 11. Verification

Implementation, testing, review, security, and verification may be
performed by different providers. Independent verification is an
important capability, but it is **part of DVL, not the whole identity of
DVL**.

## 12. Live Product Room

DVL should reduce the traditional jump from AI → project folder → editor
→ terminal → localhost → browser → AI.

The user can run and experience the product as part of DVL: open the
Homepage, test Login, click buttons, navigate, and inspect real
behavior. Whether this is embedded, external-browser, or hybrid is a
later technical/UX decision.

## 13. Design Room --- the AI is the editor

The Design Room is **not a Canva, Figma, or Photoshop clone**. Its
principle is:

> **The AI itself becomes the design interface.**

The user sees the visual result and talks to the Design Agent: - Move
this button down. - A little left. - Raise this text. - Make the logo
bigger. - Change the background. - Change this button color. - Add a
small animation here.

The loop is:

**See → Ask → Change → See → Refine → Accept.**

The user can experiment until the position, style, motion, and
composition feel right without manually operating a complicated
traditional editor.

## 14. References and inspiration

The Design Agent can receive screenshots, images, logos, videos, Reels,
visual references, existing components, text, and brand assets.

The user may say "Use this kind of background," "Use this color
feeling," or "Take inspiration from this movement." References guide the
user's own design; they are not an instruction to blindly copy another
product.

## 15. Product-wide design memory

The user can establish a decision once: \> Use this background and color
system across the whole product.

DVL should retain that as product-wide design direction. The user can
also create a local exception: \> For Component 4 only, use another
background.

DVL must understand the difference between product-wide rules and
component-specific choices.

## 16. Component workflow and Export

A product may contain several components. The user designs Component 1
conversationally until satisfied, then chooses **Export Component**. The
accepted component becomes a clear project artifact. The user then moves
to Component 2.

The same applies to a Homepage: **Design → Refine → Export Homepage**.

How exported visual artifacts become implementation/code is DVL's
technical responsibility, not manual work for the user.

## 17. Strict Design scope

The Design Agent is powerful inside Design, but does not gain unlimited
authority over unrelated project areas. Working on a Homepage design
does not authorize it to redesign the database or backend. Enforcement
details are deferred to engineering.

## 18. Skills

Projects may expose Skills such as Security, Code Review, Frontend
Design, and future specialized capabilities. Skills are project
resources that may be used or assigned with providers/workers. Their
final technical model is not frozen here.

## 19. Multiple projects

Each project owns its environment, roles, providers, tasks, state,
design work, and live product. A user can minimize/leave one
environment, work elsewhere, and return later. Background-execution
mechanics are deferred.

## 20. Product philosophy

DVL may serve senior developers, juniors, designers, founders,
entrepreneurs, and people who do not understand software tooling.

Users should not be forced to learn editors, terminals, ports, CSS,
migrations, worktrees, agent orchestration, or verification pipelines
merely to benefit from AI.

Behind DVL may exist orchestration, state machines, concurrency control,
recovery, authorization, verification, versioning, isolation, security,
provider adapters, tool execution, live-state capture, artifacts,
dependencies, and algorithms.

Those are DVL's responsibilities.

> **Complexity inside. Simplicity outside.**

The three experience values are:

**Simple + Rapide + Efficace**

DVL is simple not because the system is primitive, but because
intelligence absorbs complexity.

## 21. End-to-end journey

**Open DVL → Choose/Create Project → Describe goal/upload material →
Dynamic Project Environment → Configure Providers/Roles → Talk naturally
→ Orchestrator coordinates → Workers execute, including parallel work →
Live Task Room shows real current activity → Work survives interruption
→ Design conversationally → Export accepted components → Experience the
running product → Intervene/change direction →
Review/Test/Security/Verification → Finished product.**

## 22. What DVL is not

DVL is not: - A VS Code clone with AI - A Canva clone with AI - A Figma
clone with AI - ChatGPT with several chat windows - A dashboard with
fake Agent animations - A multi-agent show where Agents talk for
spectacle - An orchestrator that forces manual Worker management - Only
a verification product - Only a design product - Only a coding chat

## 23. Product Thesis

> **DVL is an AI-native dynamic project environment where a user can
> build, design, observe, control, verify, and experience a software
> product through natural interaction, while DVL handles technical
> complexity, orchestration, parallel work, recovery, and execution
> behind the scenes.**

In simpler terms: instead of forcing the human to jump between AI,
editor, terminal, browser, design tools, Agents, and review tools, **the
project lives in front of the user and the AI works inside that project
environment.**

## 24. Locked Product Principle

> **Do not force the user to manage complexity that AI and the system
> can manage on the user's behalf.**

And:

> **Do not hide meaningful reality the user needs to understand and
> control the project.**

**AI handles complexity. DVL exposes meaningful reality. The human keeps
control.**

------------------------------------------------------------------------

# MASTER STATE DECLARATION

This document is the **DVL Product Baseline V1**.

Future architecture must be designed to realize this experience rather
than silently changing the product because another implementation is
easier.

If research, prototyping, usability testing, security analysis, or
engineering evidence later proves a product assumption impossible or
harmful, that assumption must be explicitly reopened before this Master
Project State is changed.

**The product is defined. Engineering must now determine how to make it
real.**
