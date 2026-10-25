# WHAT DVL MEANS

## DVL Code 😈

**DVL is a desktop coding-agent product that starts like a normal coding
agent and then becomes a controlled Dynamic Project Environment for
building software.**

The product direction is:

``` text
Open a project.
Unleash the company.
```

and:

``` text
All AI brains.
One software company.
```

------------------------------------------------------------------------

## 1. First: DVL is a complete coding agent

Before the Dynamic Project Environment, DVL must work as a normal
desktop coding agent.

The user can:

-   open an existing project/folder;
-   create/open a project from Git;
-   chat about the code;
-   let a coding worker read and edit project files;
-   run terminal commands;
-   run tests/builds;
-   start the local application/dev server;
-   inspect the result;
-   upload relevant files or references;
-   continue changing the project through conversation.

This is the normal **agent coding** layer of DVL.

------------------------------------------------------------------------

## 2. Then: the project becomes a Dynamic Project Environment

DVL does not stop at one coding-agent chat.

After the project is opened, DVL can expose a **Dynamic Project
Environment** around that project.

The project can have dedicated working spaces such as:

``` text
Meeting / Chat
Live Tasks
Design
URL Live / Live Product
```

These are different views/workspaces around the **same software
project**.

They do not replace the coding-agent foundation.

------------------------------------------------------------------------

## 3. DVL is Task-first

The execution direction is:

``` text
Task
  ↓
Assignment
  ↓
Worker
  ↓
Provider / Runtime
```

A Task is the durable work.

An Assignment gives temporary authority to execute that work.

A Worker is the temporary executor.

The Provider is the AI/runtime used by that Worker.

Therefore:

``` text
Worker can die.
Work survives.
```

and:

``` text
Preserve work ≠ preserve authority.
```

DVL does not make the Worker itself the durable project.

------------------------------------------------------------------------

## 4. DVL can use different AI providers

DVL is not the same thing as Claude, Codex, Gemini, Kimi, DeepSeek, or
another provider.

Those systems can be used as providers/workers inside DVL.

Conceptually:

``` text
DVL
 ├─ coding work
 ├─ review work
 ├─ security work
 ├─ design work
 └─ other bounded specialist work
```

Different providers may be used for different roles when available.

DVL still owns the project control and Project Truth.

------------------------------------------------------------------------

## 5. DVL understands the project progressively

The preserved project-understanding direction is:

``` text
USER INPUT
   ↓
SOURCE INTENT BASELINE
   ↓
NORMAL PLAN + NORMAL GRAPH
   ↓
SMART PLAN + SMART GRAPH
   ↓
ULTRA PLAN + ULTRA GRAPH
   ↓
ULTRA-PRO RE-AUDIT / DEEP GRAPH
   ↓
URG
   ↓
DETERMINISTIC GRAPH-TO-TASK COMPILER
```

The purpose is not to replace the user's product with DVL's own idea.

The purpose is to preserve what the user wants while progressively
discovering the relations needed to build it correctly.

The governing rule is:

``` text
Depth may increase.
Intent may not drift.
```

------------------------------------------------------------------------

## 6. DVL turns project understanding into executable work

The canonical execution direction is:

``` text
SOURCE INTENT
↓
NORMAL
↓
SMART
↓
ULTRA
↓
ULTRA-PRO
↓
URG
↓
DETERMINISTIC COMPILER
↓
TASK CONTRACTS
↓
SMART ORCHESTRATOR + SMART DÉCALAGE
↓
TASK → ASSIGNMENT → WORKER
↓
KERNEL + HARNESS
↓
EVIDENCE
↓
VERIFICATION
↓
INTEGRATION
↓
PROJECT TRUTH
```

Runtime evidence can cause affected relations, Tasks, or Assignments to
be re-evaluated.

So DVL is a feedback system, not only a one-way plan.

------------------------------------------------------------------------

## 7. Smart Orchestrator

The Smart Orchestrator coordinates the work.

It determines things such as:

-   what is ready;
-   what is waiting;
-   what can run in parallel;
-   what conflicts;
-   which Worker/provider should receive an Assignment;
-   what is waiting for verification;
-   what needs human/external authority;
-   what must be reconsidered after project state changes.

The goal is:

``` text
Maximum safe useful concurrency
—not maximum worker count.
```

------------------------------------------------------------------------

## 8. Smart Décalage

Smart Décalage controls **when work should move, wait, slow down, or
resume** according to project state.

It is not arbitrary delay.

The principle is:

``` text
Delay by state,
not by arbitrary timer.
```

Work may wait because of:

-   dependencies;
-   shared resources;
-   conflicts;
-   verification backlog;
-   human/external gates;
-   changed project decisions;
-   recovery;
-   provider/token/quota pressure;
-   other execution constraints.

This lets DVL keep unrelated useful work moving instead of stopping the
entire project.

------------------------------------------------------------------------

## 9. Kernel

The Kernel is the law/enforcement boundary.

It is not the planner, graph, compiler, orchestrator, provider, or
reviewer.

It controls/enforces things such as:

-   identity;
-   Assignment authority;
-   scope;
-   stale-authority fencing;
-   isolation;
-   allowed/blocked actions;
-   durable event truth;
-   security policy;
-   execution constraints;
-   evidence authority;
-   integration prerequisites.

Conceptually:

``` text
ALLOW
BLOCK
ASK_USER
```

Prompt instructions alone are not a security boundary.

------------------------------------------------------------------------

## 10. Harness

The Harness is the execution boundary.

``` text
Kernel = law
Harness = execution engine
```

The Harness/runtime is where permitted work interacts with things such
as:

-   provider adapters;
-   files/workspaces;
-   terminal;
-   tests;
-   build tools;
-   dev servers;
-   browser;
-   databases;
-   processes;
-   MCP/tools;
-   sandbox/container mechanisms;
-   checkpoints and execution evidence.

------------------------------------------------------------------------

## 11. Evidence, Verification and Integration

DVL separates doing work from proving work.

``` text
Worker FINISHED
      ≠
Verification PASS
      ≠
Integration
      ≠
Project Truth
```

A Worker saying "done" is not enough.

DVL uses evidence such as:

-   diffs;
-   snapshots;
-   command output;
-   tests;
-   builds;
-   runtime observations;
-   screenshots;
-   browser results;
-   security findings;
-   generated artifacts;
-   scoped human acceptance.

Only the proper Integration path changes official Project Truth.

------------------------------------------------------------------------

## 12. Provider limits must not become project chaos

DVL's architecture includes work for handling
provider/context/token/quota pressure safely.

The preserved working direction includes:

``` text
GREEN
  ↓
AMBER
  ↓
RED
  ↓
SAFE BOUNDARY
  ↓
CHECKPOINT
  ↓
SAFE HANDOFF
  ↓
RESUME / REASSIGN
```

The objective is to preserve useful work before a known limit becomes
exhaustion when DVL has enough signal to do so.

A safe handoff does not mean the Task is verified or integrated.

------------------------------------------------------------------------

## 13. Recovery

DVL is designed around the fact that Workers, providers, processes, or
the application itself can fail.

The recovery direction is:

``` text
BOOT
↓
RECOVERY MODE
↓
load durable Project Truth
↓
replay durable Kernel state
↓
discover/reconcile workspaces and processes
↓
revalidate authority
↓
execution enabled
```

Stale authority must not silently return after recovery.

Ambiguous non-idempotent effects must not be blindly repeated.

------------------------------------------------------------------------

## 14. Review, Security and Audit

DVL separates implementation from controls.

Review and Security can operate as bounded specialist/control work
around normal Tasks.

They do not own Project Truth.

Audit operates at broader module/product boundaries.

The intended separation is:

``` text
implementation
↓
evidence
↓
required review/security controls
↓
verification
↓
integration
↓
Project Truth
```

Findings produce controlled rework/fix Tasks rather than silent changes
to Project Truth.

------------------------------------------------------------------------

## 15. Design Room

The Design Room is the visual world of DVL.

Its purpose is to let the user shape how the product looks.

It deals with visual things such as:

-   layout;
-   spacing;
-   colors;
-   typography;
-   images;
-   components;
-   screens;
-   animations/motion;
-   visual references;
-   accepted visual results.

It is not the backend/business-logic/security/database authority.

Accepted visual work later becomes normal implementation work through
the controlled project pipeline.

------------------------------------------------------------------------

## 16. URL Live / Live Product

DVL lets the user run and inspect the product itself.

The user can see the current local product, test it, find problems, and
ask DVL to change it.

That feedback returns into the project rather than existing as a
disconnected preview.

------------------------------------------------------------------------

## 17. What DVL is not

DVL is not:

``` text
just a chatbot
just one coding model
just a multi-model wrapper
just a task list
just a graph
just an orchestrator
just a sandbox
just a review tool
just a design tool
```

Those can all be parts of the system.

DVL is the controlled project environment that connects them around one
software project.

------------------------------------------------------------------------

# DVL in one sentence

> **DVL Code is a desktop coding-agent product that turns a software
> project into a controlled dynamic project environment, where DVL
> preserves the user's intent, understands project relations, creates
> and coordinates Tasks, gives temporary authority to Workers from
> different AI providers, controls execution through the Kernel and
> Harness, and only changes Project Truth through evidence, verification
> and integration.**

# Short identity

``` text
DVL CODE 😈

Open a project.
Unleash the company.

All AI brains.
One software company.
```
