# Implementation Planning Skill — Nora

## The most important rule


> **Do not create an implementation plan merely by translating the user's request into a list of files. First understand the existing system, identify the actual problem and constraints, evaluate the available approaches, then produce a repository-grounded plan that explains the architecture, change surface, invariants, risks, testing, and verification.**

And one more:

> **A plan is allowed to conclude that the requested implementation approach is not the best approach. If investigation reveals a simpler, safer, or more architecturally consistent solution, explain the difference and recommend it rather than blindly planning the requested approach.**


## 1. Purpose

The purpose of implementation planning is to produce a **repository-grounded, technically complete implementation strategy** before code is changed.

A plan must describe:

- what is changing
- why it is changing
- how the system currently works
- how it should work afterward
- which components are affected
- how data/state flows through the system
- what risks exist
- how the change will be verified

**A plan is not a list of files to edit.**

---

# 2. Do Not Plan From the User Request Alone

For any non-trivial task, inspect the repository before producing a detailed plan.

Understand:

- current implementation
- architecture
- relevant modules
- callers
- consumers
- state ownership
- data flow
- database
- IPC
- existing abstractions
- existing tests
- configuration
- related features

Do not invent architecture that already exists in the repository.

Do not propose replacing an existing abstraction without first understanding why it exists.

---

# 3. Determine the Planning Scope

First classify the task:

### Small

Examples:

- isolated bug fix
- small UI change
- pure utility change

Planning can be concise.

### Medium

Examples:

- new feature spanning several modules
- state-management change
- new IPC endpoint
- DB-backed feature

Require architecture, affected components, implementation steps, and tests.

### Large

Examples:

- subsystem redesign
- queue architecture
- scanning pipeline
- persistence redesign
- major performance work

Require deeper investigation, alternatives, data flow, ownership, migration, failure modes, performance, and staged implementation.

**Planning depth must be proportional to risk and complexity.**

---

# 4. Establish the Current Architecture

Before proposing changes, explain the relevant existing flow.

For example:

```text
Current:

Filesystem
   ↓
Watcher
   ↓
Scanner
   ↓
Metadata Parser
   ↓
Database
   ↓
Query
   ↓
Renderer
```

Do not document the entire application if only one subsystem is relevant.

Focus on the architecture that the change touches.

---

# 5. Identify the Actual Problem

Clearly distinguish:

```text
Observed behavior
        ↓
Underlying problem
        ↓
Root cause
        ↓
Desired behavior
```

Do not confuse the requested solution with the problem.

If the user says:

> “Let's add caching.”

the plan should first establish:

> What problem does caching solve?

If the real problem is excessive database queries caused by invalidation behavior, the plan should say so.

---

# 6. Define the Desired Behavior

Before implementation, establish what success means.

Describe:

- expected behavior
- inputs
- outputs
- state changes
- persistence
- user-visible effects
- failure behavior

When useful, provide concrete scenarios.

Example:

```text
User starts scan
    ↓
Scan enters "running"
    ↓
Files processed
    ↓
Progress emitted in batches
    ↓
Scan completes
    ↓
State becomes "completed"
```

---

# 7. Identify System Boundaries

Explicitly identify affected boundaries:

- renderer ↔ main
- main ↔ database
- main ↔ filesystem
- process ↔ worker
- store ↔ persistence
- API ↔ consumer
- component ↔ hook
- service ↔ service

Boundary changes deserve extra scrutiny because they are common sources of hidden regressions.

---

# 8. Map the Change Surface

Identify affected files/modules by responsibility.

For example:

```text
Main
├── scanner service
├── metadata worker
└── DB repository

IPC
└── scan progress events

Renderer
├── scan hook
├── progress UI
└── query invalidation

Tests
├── scanner.test.ts
├── metadataWorker.test.ts
└── scan.integration.test.ts
```

Do not list files merely because their names sound related.

Every file in the plan should have a reason.

---

# 9. Explain Why Each Change Is Needed

For every major file/module:

```text
File/module
→ responsibility
→ required change
→ reason
```

Avoid:

> “Modify scanner.ts.”

Prefer:

> “Update `scanner.ts` so scan scheduling is bounded rather than creating unbounded concurrent metadata operations. This is required because the current producer can outpace the metadata processing stage.”

---

# 10. Identify Ownership

For every new or changed state/value, establish its owner.

Ask:

> Where is the authoritative source of truth?

For example:

```text
Persistent data
→ Database

Main-process operational state
→ Main service

Global renderer state
→ Store

Server/cache state
→ Query cache

UI-only transient state
→ Component
```

Avoid introducing duplicate sources of truth.

---

# 11. Define Data Flow

For meaningful changes, explicitly describe:

```text
Input
 ↓
Transformation
 ↓
State
 ↓
Persistence
 ↓
Event/API
 ↓
Consumer
```

For example:

```text
Filesystem event
 ↓
Watcher
 ↓
Path normalization
 ↓
Scan queue
 ↓
Worker pool
 ↓
Batch collector
 ↓
DB transaction
 ↓
Progress event
 ↓
Renderer
```

This helps expose missing pieces before implementation.

---

# 12. Define Invariants

Every significant design should identify important invariants.

Examples:

```text
A queue position always references an existing queue entry.
```

```text
A folder watcher can only be registered once for a path.
```

```text
A transaction-scoped operation never falls back to the global DB connection.
```

```text
A scan cannot report "completed" while work remains pending.
```

These become implementation and testing targets.

---

# 13. Define State Transitions

For stateful features, document transitions.

Example:

```text
idle
 ↓ start
running
 ↓ success
completed
```

Failure:

```text
running
 ↓ error
failed
```

Cancellation:

```text
running
 ↓ cancel
cancelling
 ↓ cleanup
cancelled
```

Don't add states unnecessarily, but don't hide important transitions either.

---

# 14. Consider Concurrency Explicitly

Any implementation involving:

- async operations
- workers
- queues
- watchers
- events
- DB writes
- IPC
- background tasks

must address:

- concurrency limit
- ordering
- deduplication
- backpressure
- cancellation
- retries
- shared state
- shutdown
- race conditions

The plan should state **who owns concurrency control**.

Avoid vague plans like:

> “Process files asynchronously.”

Specify how.

---

# 15. Consider Failure Modes

For every multi-step operation, ask:

> What happens if step N fails?

Consider:

- DB failure
- filesystem failure
- worker failure
- IPC failure
- malformed input
- cancellation
- application shutdown
- partial completion
- duplicate execution
- restart

The plan should define the desired behavior where it matters.

---

# 16. Database Planning

If the change touches persistence, explicitly plan:

- schema changes
- migration
- indexes
- constraints
- transactions
- rollback
- existing data
- compatibility
- query changes
- write patterns

Never write:

> “Update DB schema.”

Specify:

```text
Current schema
→ required new state
→ migration
→ application code
→ tests
```

---

# 17. API / IPC Planning

For API or IPC changes, identify:

- producer
- consumer
- request shape
- response shape
- events
- errors
- validation
- backwards compatibility
- lifecycle

If an existing endpoint can support the feature without adding another API, prefer reusing it where appropriate.

---

# 18. Testing Must Be Planned Alongside Implementation

Don't treat testing as the final step.

For every major change, identify:

### Unit tests

What isolated behavior must be proven?

### Integration tests

What interaction must be proven?

### Regression tests

What previous bug must never return?

### Stress tests

Is scale/concurrency relevant?

### Performance tests

Is there a measurable performance requirement?

Example:

```text
Implementation
├── scanner changes
├── worker changes
└── DB changes

Tests
├── scanner unit test
├── worker unit test
├── DB transaction test
├── scan integration test
└── concurrent scan regression test
```

Follow Nora's testing conventions when determining locations.

---

# 19. Don't Design Tests Around Implementation Details

The implementation plan should specify **behavior to prove**, not merely methods to call.

Bad:

> “Mock `processFile()` and verify it was called 100 times.”

Better:

> “Verify that 100 files are processed exactly once and that completion is not reported until all processing has finished.”

---

# 20. Performance Planning

If performance is relevant, explicitly identify:

- current bottleneck
- expected workload
- computational complexity
- DB query impact
- memory behavior
- IPC volume
- concurrency
- rendering impact
- expected measurement

Do not promise performance improvements without measurement.

Use:

> “Expected to reduce X; verify with benchmark Y.”

rather than:

> “This will make the app much faster.”

---

# 21. Avoid Unnecessary Refactoring

The plan should distinguish:

```text
Required
```

from:

```text
Helpful but optional
```

Do not bundle unrelated cleanup into the implementation unless it materially reduces risk.

If a refactor is required because the existing architecture prevents the feature from being implemented safely, explain why.

---

# 22. Consider Backward Compatibility

For changes to:

- persisted state
- DB
- IPC
- serialized data
- APIs
- configuration
- user settings

ask:

> What happens to existing installations/data?

The plan must address compatibility where relevant.

---

# 23. Consider Migration and Rollback

For risky changes:

```text
Current
 ↓
Migration
 ↓
New implementation
 ↓
Verification
```

Consider:

- partially completed migrations
- failed upgrades
- old data
- downgrade behavior
- feature flags where appropriate

Don't invent rollback mechanisms where the project doesn't need them, but identify the risk.

---

# 24. Break Large Work Into Safe Phases

For large changes, don't create one enormous implementation step.

Prefer:

```text
Phase 1 — Establish infrastructure
Phase 2 — Implement core behavior
Phase 3 — Connect consumers
Phase 4 — Add integration
Phase 5 — Performance validation
Phase 6 — Cleanup
```

Each phase should ideally leave the repository in a verifiable state.

---

# 25. Define Dependencies Between Steps

Make ordering explicit.

For example:

```text
1. Add schema/migration
       ↓
2. Add repository API
       ↓
3. Update service
       ↓
4. Update IPC
       ↓
5. Update renderer
       ↓
6. Add integration tests
```

Don't tell the implementer to modify consumers before the underlying contract exists unless the workflow deliberately uses that strategy.

---

# 26. Identify Risks Before Implementation

Every non-trivial plan should include a short risk assessment.

Example:

| Risk | Why | Mitigation |
|---|---|---|
| DB contention | Multiple background writers | Serialize writes |
| Event flooding | Watchers can emit bursts | Debounce/batch |
| Memory growth | Large pending queue | Bounded queue |
| Stale UI | Async state updates | Explicit invalidation |

Don't invent risks simply to fill a table.

---

# 27. Identify Open Questions

If something genuinely cannot be determined from the repository:

```text
Open question:
Should scan cancellation guarantee that no additional metadata writes occur after cancellation?
```

Don't silently make a major architectural assumption.

However, don't ask questions whose answers can be determined by inspecting the code.

---

# 28. Challenge the Plan Before Presenting It

Before finalizing, attack your own plan.

Ask:

> Does this actually solve the root problem?

> Did I accidentally create another source of truth?

> Can operations race?

> Can work become unbounded?

> What happens during shutdown?

> What happens if the DB fails?

> Does this break existing consumers?

> Is there a simpler design?

> Am I adding architecture that isn't necessary?

> Can this be tested?

> Can this be rolled back?

Only then present the plan.

---

# 29. Plan Output Format

For a substantial task, use:

```text
# Implementation Plan

## 1. Objective

What we're trying to achieve.

## 2. Current Behavior

How the system currently works.

## 3. Problem / Root Cause

What is wrong and why.

## 4. Proposed Design

The chosen approach and why.

## 5. Architecture / Data Flow

How information moves through the system.

## 6. Ownership & Invariants

Sources of truth and rules that must remain true.

## 7. Implementation Changes

### Step 1 — ...
Files/modules:
- ...
Reason:
- ...

### Step 2 — ...
...

## 8. Database / Migration

Only if relevant.

## 9. Testing Strategy

Unit:
- ...

Integration:
- ...

Regression:
- ...

Stress/performance:
- ...

## 10. Risks

- ...

## 11. Verification

- ...

## 12. Open Questions

Only if genuinely unresolved.
```

---

# 30. Plan Quality Standard

A good plan should allow another competent engineer to implement the change **without having to rediscover the architecture from scratch**.

But it should not prescribe every line of code.

The plan should define:

> **what, where, why, dependencies, invariants, risks, and verification**

while leaving reasonable implementation details to the implementer.

---

# 31. Never Pretend Investigation Happened

If the plan was created without repository inspection, explicitly say so.

Never write:

> “The current scanner uses X”

unless that was actually verified.

Distinguish:

- verified architecture
- inferred architecture
- proposed architecture

---

# 32. Planning Completion Checklist

Before presenting a non-trivial plan:

```text
□ Current implementation understood
□ Relevant callers inspected
□ Relevant consumers inspected
□ Existing abstractions identified
□ Actual problem identified
□ Root cause established where applicable
□ Desired behavior defined
□ Data flow understood
□ State ownership defined
□ Invariants identified
□ Concurrency considered
□ Failure modes considered
□ DB/migrations considered
□ IPC/API considered
□ Performance considered
□ Backward compatibility considered
□ Tests planned
□ Risks identified
□ Implementation order established
□ Plan challenged for simpler alternatives
□ Verification criteria defined
```

---


