---
name: design-discussion-planning-conventions
description: Guidelines and principles for exploring, evaluating, and discussing system design, architecture, and feature planning before implementation.
---

# Design Discussion Mode

When the user is discussing a design, architecture, feature concept, or possible approach, **do not prematurely convert the discussion into an implementation plan.**

The goal is to help the user discover the best design.

### 1. Understand before recommending

First establish:

- What problem are we actually solving?
- Why does it need to exist?
- Who/what consumes the result?
- What constraints already exist?
- What assumptions are being made?
- What existing architecture is relevant?
- What is the expected scale?
- What happens when things fail?

If repository inspection is available and the answer depends on the current implementation, inspect it before making architectural claims.

---

### 2. Separate problem from proposed solution

Never assume the user's proposed solution is the actual requirement.

For example:

> “Should we add a worker pool?”

First ask:

> “What problem are we trying to solve that requires a worker pool?”

Then determine whether the real solution might instead be:

- batching
- backpressure
- reducing work
- caching
- changing ownership
- moving work to another process
- limiting concurrency
- changing the data flow

**Evaluate the problem independently from the proposed mechanism.**

---

### 3. Explore multiple viable designs

For meaningful architectural decisions, consider multiple approaches.

For each approach discuss:

- architecture
- data flow
- complexity
- performance
- memory
- concurrency
- failure behavior
- maintainability
- extensibility
- migration cost
- testing complexity

Do not manufacture alternatives when one solution is clearly superior.

---

### 4. Prefer trade-off analysis over opinions

Avoid:

> “I think Approach A is better.”

Prefer:

> “Approach A reduces IPC traffic and keeps ownership centralized, but increases coupling to the main process. Approach B provides stronger isolation but introduces another synchronization boundary.”

Then make a recommendation.

---

### 5. Identify hidden consequences

For every significant design, ask:

> “What does this decision force us to do later?”

Consider:

- state ownership
- API contracts
- persistence
- migrations
- caching
- invalidation
- synchronization
- cancellation
- retries
- observability
- testing
- backwards compatibility
- future feature pressure

A design that looks simple locally may create complexity elsewhere.

---

### 6. Think about failure paths during design

Don't design only:

```text
success → success → success
```

Also design:

```text
start
 ↓
partial progress
 ↓
failure
 ↓
retry/cancel/recover
```

Ask:

- What if the process crashes?
- What if the DB fails?
- What if the same operation starts twice?
- What if the input changes during processing?
- What if the user cancels?
- What if the worker dies?
- What if the application restarts?

---

### 7. Consider scale explicitly

For Nora, don't evaluate designs only against:

```text
10 songs
```

Consider realistic workloads such as:

```text
10k–50k files
large queues
many watchers
large metadata payloads
rapid filesystem events
multiple simultaneous operations
```

A design should be evaluated against its intended workload.

---

### 8. Don't over-engineer hypothetical futures

Do not introduce architecture merely because:

> “We might need this someday.”

Require a concrete benefit.

Prefer:

> simple architecture that can evolve

over:

> generalized architecture designed for every possible future.

---

### 9. Challenge the design

Before recommending a design, actively try to break it.

Ask:

> What is the weakest part of this design?

> What happens under concurrency?

> What happens during shutdown?

> What happens with stale state?

> What happens with partial failure?

> What happens at 10× the expected workload?

> What becomes difficult to test?

> What new coupling does this introduce?

If the design survives those questions, confidence increases.

---

# Planning Mode

Planning should happen **after sufficient investigation**, but before implementation.

A plan is not a list of files to edit.

It is a description of **how the system will change and why**.

### 1. Investigate first

Before creating a non-trivial implementation plan, inspect:

- current architecture
- relevant source files
- callers
- consumers
- state flow
- database/schema
- IPC
- existing utilities
- tests
- related features
- configuration

Do not create a detailed plan from filenames alone.

---

### 2. Establish the current state

A good plan should explain:

```text
Current behavior
        ↓
Problem / limitation
        ↓
Root cause
        ↓
Desired behavior
        ↓
Proposed architecture
```

This makes it possible to audit whether the plan actually solves the problem.

---

### 3. Identify the change surface

Explicitly identify affected areas.

For example:

```text
Renderer
 └── Queue UI

State
 └── Queue store

IPC
 └── queue:update

Main
 └── Queue service

Database
 └── schema/migration

Tests
 ├── unit
 └── integration
```

This is much more useful than:

> “Modify Queue.tsx and store.ts.”

---

### 4. Describe data flow

For non-trivial features, show how information moves.

Example:

```text
Filesystem event
      ↓
Watcher
      ↓
Scanner
      ↓
Worker pool
      ↓
Batch collector
      ↓
DB queue
      ↓
Persistence
      ↓
IPC event
      ↓
React query/state
      ↓
UI
```

The agent should understand the entire flow before implementation.

---

### 5. Identify ownership

For every important piece of state, determine:

> Who owns this?

For example:

```text
Persistent state → Database
Application state → Store
Server/main-process state → Main service
UI-only state → React
Derived state → Computed from authoritative state
```

Avoid introducing a second source of truth accidentally.

---

### 6. Define invariants

A strong implementation plan explicitly states what must remain true.

Example:

```text
Invariant:
Only one component owns queue persistence.

Invariant:
Queue position must always refer to a valid queue entry.

Invariant:
Folder watcher registration is idempotent.

Invariant:
A transaction-scoped operation never accesses the global DB connection.
```

These invariants become implementation and testing targets.

---

### 7. Include migration strategy

For changes involving:

- DB
- persisted state
- APIs
- IPC
- serialized structures
- configuration

the plan must explain:

- existing format
- new format
- migration
- compatibility
- rollback behavior

---

### 8. Include testing strategy in the plan

Don't leave testing as:

> “Add tests.”

Instead specify:

```text
Unit:
- verify X
- verify Y
- verify failure Z

Integration:
- verify A → B → C

Regression:
- reproduce previous bug

Stress:
- verify behavior with N concurrent operations
```

---

### 9. Include performance implications

For meaningful changes, state:

- expected complexity
- potential bottleneck
- memory implications
- concurrency
- DB impact
- IPC impact
- rendering impact
- expected workload

If performance is uncertain:

> identify it as something to measure rather than pretending the design is faster.

---

### 10. Define verification before implementation

A good plan should answer:

> “How will we know this worked?”

before any code is written.

For example:

```text
Implementation
      ↓
Unit tests
      ↓
Integration test
      ↓
Typecheck
      ↓
Lint
      ↓
Build
      ↓
Stress test
      ↓
Runtime verification
```

---

# Planning Depth Rules

Not every task needs a 40-step plan.

Use proportional depth.

### Small change

```text
Understand
→ modify
→ targeted test
→ verify
```

### Medium feature

```text
Investigate
→ design
→ implementation steps
→ tests
→ verification
```

### Large architectural change

```text
Investigation
→ current architecture
→ requirements
→ constraints
→ alternatives
→ trade-offs
→ recommended architecture
→ data flow
→ ownership
→ migration
→ implementation phases
→ testing strategy
→ performance
→ failure modes
→ rollout
→ verification
```

**Planning depth should match risk and complexity.**

---

# Implementation Plan vs Design Discussion

I'd explicitly tell the agent to distinguish these.

### Design discussion

The user is asking:

> “What should we do?”

The agent should:

**Explore → compare → challenge → recommend**

No coding unless requested.

### Implementation planning

The user is asking:

> “How should we build the chosen approach?”

The agent should:

**Investigate → define architecture → identify changes → define tests → produce plan**

Still don't code unless requested.

### Implementation

The user is asking:

> “Build it.”

The agent should:

**Inspect → plan internally → implement → test → verify → report**

### Review

The user is asking:

> “Is this correct?”

The agent should:

**Inspect → challenge → find defects → prove findings → recommend**

Don't automatically rewrite the code.

---

# One More Mode I'd Add: Exploration / Investigation

This is especially valuable for the way you work.

When the user says something like:

> “Let's investigate this.”

the agent should **not jump to a fix**.

Instead:

```text
Question
 ↓
Hypotheses
 ↓
Repository investigation
 ↓
Evidence
 ↓
Experiments
 ↓
Narrow hypotheses
 ↓
Root cause
 ↓
Confidence
 ↓
Possible solutions
```

And importantly:

> **An investigation is allowed to conclude that the suspected problem is not actually the problem.**

That's extremely important for AI agents.

---

## The overall agent behavior becomes

```text
                    USER REQUEST
                         │
                         ▼
                 Identify the mode
                         │
       ┌─────────────────┼─────────────────┐
       ▼                 ▼                 ▼
  DISCUSSION        INVESTIGATION        REVIEW
       │                 │                 │
 explore options     gather evidence    attack assumptions
       │                 │                 │
 trade-offs          reproduce          prove findings
       │                 │                 │
 recommendation      root cause         severity
       │                 │                 │
       └─────────────────┼─────────────────┘
                         ▼
                       PLAN
                         │
               architecture + changes
               tests + risks + migration
                         │
                         ▼
                  IMPLEMENTATION
                         │
                         ▼
                    VERIFICATION
                         │
                         ▼
                      REPORT
```

That is the kind of structure I'd want in a **serious autonomous coding agent**.

The most important addition, IMO, is this principle:

> **Do not confuse knowing what code to change with understanding what should be changed.**
