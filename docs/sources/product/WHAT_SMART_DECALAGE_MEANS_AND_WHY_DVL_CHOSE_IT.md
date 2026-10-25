# SMART DÉCALAGE --- WHAT IT MEANS AND WHY DVL CHOSE IT

## 1. Name

**Smart Décalage**

The DVL project uses the word **Décalage** for the mechanism that shapes
the timing of work according to the current project state.

In the DVL source documents, its canonical definition is:

> **Smart Décalage is state-driven flow control.**

And its governing principle is:

> **Delay by state, not by arbitrary timer.**

This document preserves that DVL meaning. It does not introduce a new
architecture.

------------------------------------------------------------------------

## 2. What "Décalage" means in DVL

In DVL, Décalage means that Tasks do not all start immediately just
because they exist or because a Worker is free.

DVL can deliberately **shift, delay, hold, release, or reshape the
timing of work** according to what is happening in the project.

The important idea is not simply "delay".

It is:

``` text
Task A can move now.
Task B should wait.
Task C can run in parallel.
Task D must wait for a resource.
Task E waits for verification.
Task F waits because a project decision changed.
Task G waits because recovery is in progress.
```

Therefore the execution of Tasks is **offset from each other according
to state**.

That is the role represented by the name **Décalage** in DVL.

------------------------------------------------------------------------

## 3. Why DVL needs it

DVL can have many Tasks and many possible Workers.

But:

``` text
many Tasks
≠
all Tasks should run now
```

The Orchestrator's optimization target in the DVL sources is:

> **Maximum safe useful concurrency --- not maximum worker count.**

The Orchestrator determines which work is structurally ready and how
work should be coordinated.

Smart Décalage shapes **when that work should actually move, wait, slow
down, or resume**.

Without this timing control, parallel work can collide even when
individual Tasks are valid.

------------------------------------------------------------------------

## 4. Why not simply start everything in parallel?

Because Tasks can share or depend on real project resources and states.

The DVL sources list runtime resources such as:

``` text
files/directories
Git/worktrees
ports/processes
DB/schema/migrations
Redis/cache
queues
browser sessions
external APIs
credentials
CPU/RAM/disk/network
provider/context/budget capacity
```

Their relations/states can include:

``` text
shareable-read
exclusive-write
serialize
parallel-safe
state-gated
human-gated
external-authority-gated
budget-gated
```

Therefore two Tasks that look ready at a superficial level may not be
safe or useful to execute at the same moment.

------------------------------------------------------------------------

## 5. What can cause Décalage?

The current DVL Master State explicitly records these possible causes of
delay/HOLD:

``` text
prerequisite not ready
resource locked
conflicting resource
shared external API conflict
verification backlog
project decision changed
environment unavailable
authority missing
recovery in progress
unresolved high-risk condition
Provider/Worker budget danger
```

These are project/runtime states.

They are not arbitrary sleep timers.

------------------------------------------------------------------------

## 6. The central law

The core law is:

``` text
Delay by state,
not by arbitrary timer.
```

DVL should not say:

``` text
wait 20 seconds because 20 seconds sounds safe
```

The intended model is:

``` text
WAIT because condition X is unresolved
↓
observe project/runtime state
↓
condition X becomes satisfied
↓
release/re-evaluate the Task
```

The delay has a reason.

The release has a reason.

Both can be connected to project state.

------------------------------------------------------------------------

## 7. Example --- dependency

Suppose:

``` text
T1 creates the database schema
T2 implements API code that depends on that schema
T3 builds an unrelated UI component
```

The desired timing is not:

``` text
T1 + T2 + T3 all start immediately
```

It can be:

``` text
T1 → RUN

T2 → WAIT
reason: prerequisite not ready

T3 → RUN
reason: unrelated work can continue
```

When T1 reaches the required verified state, T2 can be reconsidered.

The whole project does not need to stop because T2 is waiting.

------------------------------------------------------------------------

## 8. Example --- shared resource

Suppose two Tasks both need an exclusive write to the same resource.

Conceptually:

``` text
T10 ─┐
     ├── shared exclusive resource
T11 ─┘
```

Running both at the same time can create a collision.

Décalage allows execution to become:

``` text
T10 → RUN
T11 → WAIT

T10 releases/completes required resource state
↓
T11 → RE-EVALUATE
↓
T11 → RUN
```

This is not an arbitrary delay.

It is resource-state-driven timing.

------------------------------------------------------------------------

## 9. Example --- verification backlog

A Worker finishing implementation does not mean Project Truth changed.

DVL preserves:

``` text
Worker FINISHED
≠
Verification PASS
≠
Integration
≠
Project Truth
```

If implementation is being produced faster than verification can safely
consume it, Smart Décalage can shape admission/timing instead of
allowing uncontrolled work to pile up.

The reason is:

``` text
verification backlog
```

not:

``` text
wait because the system always waits N seconds
```

------------------------------------------------------------------------

## 10. Example --- changed Project Decision

Suppose a Task was ready under one project decision.

Then that relevant decision changes before execution or integration.

The Task may need to stop or be re-evaluated.

Conceptually:

``` text
Task READY
↓
relevant Project Decision changes
↓
Task no longer safely READY
↓
WAIT / HOLD / RE-EVALUATE
```

Décalage allows project timing to respond to current truth rather than
continuing from stale assumptions.

------------------------------------------------------------------------

## 11. Example --- recovery

The DVL recovery architecture preserves:

``` text
Worker can die.
Work survives.
```

but also:

``` text
Preserve work ≠ preserve stale authority.
```

During recovery, some work may need to wait while DVL:

``` text
loads durable Project Truth
replays durable Kernel state
discovers/reconciles workspaces/processes
revalidates authority
```

So:

``` text
recovery in progress
```

is a valid Décalage condition.

Work resumes according to recovered state rather than simply according
to elapsed time.

------------------------------------------------------------------------

## 12. Example --- Provider/token/budget danger

The October 8 Master State added Provider/Worker budget danger as
another possible cause.

The working budget direction uses:

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
```

Smart Décalage can therefore participate in shaping work when provider
capacity is becoming dangerous.

For example, DVL should not necessarily start a large new sub-work item
when the relevant Worker/provider is approaching a safe-stop condition.

Again, the timing changes because **state changed**.

------------------------------------------------------------------------

## 13. Smart Orchestrator vs Smart Décalage

They are related, but the DVL architecture does not define them as the
same responsibility.

### Smart Orchestrator

Coordinates work and decides things such as:

``` text
which Tasks are structurally ready
which Worker/provider gets an Assignment
what can safely run in parallel
what must wait
what waits for verification
what needs human/external approval
when state changes require re-evaluation
```

### Smart Décalage

Shapes execution timing according to current state.

A useful representation of the preserved division is:

``` text
GRAPH
describes relations
        ↓
ORCHESTRATOR
coordinates/schedules work
        ↓
SMART DÉCALAGE
shapes timing / WAIT / HOLD / release pressure
        ↓
KERNEL + RUNTIME
enforce real boundaries
```

The Master State states this boundary directly:

``` text
The graph describes relations.
Orchestrator/Décalage schedule.
Kernel/runtime enforce real boundaries.
```

------------------------------------------------------------------------

## 14. Décalage is not authority

Smart Décalage cannot authorize an action.

It cannot override Kernel law.

The DVL source explicitly states:

> **Smart Décalage cannot override Kernel law.**

Therefore:

``` text
Décalage says:
this work should move/wait according to state

Kernel says:
this action is or is not authorized
```

Those are different responsibilities.

------------------------------------------------------------------------

## 15. Why DVL chose this architecture

The choice follows directly from the DVL execution goal.

DVL is designed for projects where:

``` text
Tasks have dependencies
Tasks share resources
Workers operate in parallel
verification has finite capacity
project decisions can change
providers can approach limits
runtime failures happen
recovery can temporarily invalidate readiness
```

A simple model of:

``` text
READY → start immediately
```

is not enough for that environment.

DVL therefore needs state-sensitive execution timing.

The chosen rule is:

``` text
Maximum safe useful concurrency
+
Delay by state, not by arbitrary timer
```

This allows DVL to keep useful independent work moving while delaying
only the work whose current state requires delay.

------------------------------------------------------------------------

## 16. Why the name fits the DVL concept

The DVL documents establish the mechanism's technical meaning as
**state-driven flow control**.

Within that architecture, the name **Décalage** represents the
intentional offset/shift between Tasks in execution time.

Conceptually:

``` text
Tasks exist together
        ↓
but they do not all move together
        ↓
their execution is shifted according to:
dependencies
resources
verification
authority
recovery
risk
provider capacity
current project state
```

So DVL's use of the name can be summarized as:

> **Smart Décalage = intelligently shifting the timing of work according
> to project state so DVL gets safe, useful concurrency instead of
> blindly running everything at once.**

------------------------------------------------------------------------

## 17. What Smart Décalage is NOT

It is not:

``` text
a random delay
a fixed sleep timer
a replacement for the Orchestrator
a replacement for the Graph
a replacement for the Kernel
an authority system
a Worker
a Provider
```

And it cannot override Kernel law.

------------------------------------------------------------------------

## 18. Short definition

``` text
SMART DÉCALAGE

State-driven execution timing.

It decides when work should be delayed,
held, released, slowed, or allowed to continue
according to the current project/runtime state.

Principle:
Delay by state, not by arbitrary timer.

Goal:
Maximum safe useful concurrency,
not maximum worker count.
```

------------------------------------------------------------------------

## 19. Position inside DVL

``` text
URG / PROJECT RELATIONS
        ↓
DETERMINISTIC COMPILER
        ↓
TASK CONTRACTS
        ↓
SMART ORCHESTRATOR
        +
SMART DÉCALAGE
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

Smart Décalage is therefore the part of DVL's execution-control
architecture concerned with **state-driven timing and flow**, while
authority and enforcement remain elsewhere.

# END
