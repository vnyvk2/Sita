---
name: code-review
description: Rigorous adversarial code review methodology for auditing correctness, architecture, concurrency, and reliability.
---

# Code Review Skill — Nora

# 0. Most Important Rule

> **The reviewer is an adversary of the change, not an advocate for it. Attempt to disprove correctness before accepting it. However, every reported issue must be grounded in evidence or clearly labeled as an unverified risk.**

That balance is crucial.

You don't want an agent that says:

> “Looks good 👍”

Nor do you want one that produces 27 imaginary “potential issues.”

You want:

> **“I tried to break this from several angles. These two things are actually broken, this third concern is theoretically possible but I couldn't establish an execution path, and everything else checks out.”**

## 1. Review Objective

The purpose of code review is to determine whether a change is:

- correct
- complete
- safe
- compatible with existing behavior
- performant enough
- concurrency-safe
- maintainable
- adequately tested
- consistent with the architecture

**Do not optimize for approval. Optimize for finding real defects.**

A review is successful when it either:

1. proves the change is sound, or
2. finds issues that should be addressed before acceptance.

Do not invent findings merely to make the review appear thorough.

---

# 2. Review Before Suggesting Changes

When asked to review code:

**Do not immediately modify the code.**

First:

1. inspect the diff
2. understand the surrounding implementation
3. inspect callers and consumers
4. inspect related state/data flow
5. inspect relevant tests
6. inspect configuration/schema/migrations when applicable
7. understand the intended behavior
8. identify risks
9. formulate findings
10. only then recommend fixes

If implementation is requested separately, switch into implementation mode.

---

# 3. Review the Change, Not Just the Diff

A diff is not the system.

For every meaningful change, ask:

> What existing behavior does this interact with?

Inspect beyond the changed lines when necessary.

A review may require examining:

- callers
- callees
- sibling modules
- shared utilities
- types
- database code
- IPC handlers
- stores
- React components/hooks
- event listeners
- workers
- tests
- configuration
- migrations

**Never conclude that a change is safe merely because the diff itself looks reasonable.**

---

# 4. Establish the Intended Contract

Before judging correctness, determine:

- What was the change supposed to accomplish?
- What behavior should change?
- What behavior must not change?
- What assumptions does the implementation make?
- What invariants must remain true?

If the intended behavior is unclear, say so.

Do not invent requirements.

---

# 5. Adversarial Mindset

For every significant change, actively try to break it.

Ask:

> How could this fail?

Then investigate the highest-risk possibilities.

Consider:

- unexpected inputs
- empty states
- duplicate operations
- repeated execution
- concurrent execution
- stale state
- partial failure
- cancellation
- restart
- shutdown
- large workloads
- slow dependencies
- dependency failure
- corrupted data
- migration problems
- backwards compatibility

The reviewer should behave like someone trying to discover a production incident **before production does**.

---

# 6. Never Trust the Happy Path

If the implementation works for:

```text
normal input
→ normal execution
→ normal completion
```

that proves very little.

Also reason about:

```text
empty input
invalid input
duplicate input
partial input
failure
retry
cancellation
concurrent execution
restart
shutdown
large workload
stale state
```

Only investigate scenarios relevant to the system being reviewed.

---

# 7. Root Cause Analysis

When identifying a bug, determine:

```text
Symptom
 ↓
Mechanism
 ↓
Root cause
 ↓
Why existing safeguards failed
 ↓
Impact
```

Do not stop at:

> “This line can throw.”

Determine:

> Under what conditions can it throw, what causes those conditions, and what happens to the system afterward?

---

# 8. Concurrency Review — Extremely Important

For every async/event/worker/queue/watch/database change, explicitly inspect concurrency.

Ask:

### Reentrancy

Can the same operation run again before the first invocation finishes?

### Overlap

Can two invocations access the same resource simultaneously?

### Ordering

Is execution order guaranteed?

### Atomicity

Can another operation observe intermediate state?

### Ownership

Who owns the shared state?

### Cancellation

What happens when work is cancelled halfway through?

### Backpressure

What happens when producers are faster than consumers?

### Shutdown

Can pending work outlive the component/process that created it?

### Deduplication

Can the same work be scheduled multiple times?

### Race conditions

Can different execution paths observe stale state?

**Never assume `async/await` makes code sequential globally.**

---

# 9. Database Review

Treat database changes as high risk.

Inspect:

- transaction boundaries
- transaction scope
- connection usage
- concurrent writes
- locking
- isolation
- rollback behavior
- retries
- constraints
- indexes
- query count
- N+1 queries
- migrations
- existing data
- startup migration behavior

### Critical rule

When a transaction exists, verify every DB operation inside the logical transaction uses the correct transaction context.

Look specifically for accidental mixing of:

```text
transaction-scoped DB
```

and:

```text
global DB
```

This can produce deadlocks or inconsistent behavior depending on the database implementation.

---

# 10. State Management Review

For state changes, identify:

- source of truth
- derived state
- persistence
- synchronization
- invalidation
- ownership
- update ordering

Ask:

> Can two sources of truth diverge?

> Can stale state overwrite newer state?

> Can an update be lost?

> Can state survive restart incorrectly?

> Can a component render using partially updated state?

---

# 11. Event / Listener Review

For event-driven code, inspect:

- listener registration
- duplicate registration
- cleanup
- lifecycle
- event frequency
- recursive events
- event ordering
- error handling
- backpressure

A particularly important question:

> Can this listener accidentally cause another event that triggers itself again?

Also:

> Is cleanup guaranteed if initialization partially fails?

---

# 12. Filesystem Review

For filesystem-related changes, consider:

- missing files
- deleted files
- renamed files
- duplicate events
- event storms
- directory recursion
- symlinks where relevant
- path normalization
- Windows paths
- permissions
- concurrent filesystem changes
- watcher cleanup

Never assume one filesystem operation produces exactly one event.

---

# 13. Frontend / React Review

Inspect:

- hook rules
- effect dependencies
- stale closures
- cleanup
- subscriptions
- render frequency
- unnecessary state
- derived state
- query invalidation
- race conditions
- component lifecycle
- large-list rendering
- IPC frequency

Ask:

> What happens if this component mounts, unmounts, and mounts again?

And:

> What happens if the underlying data changes while this component is waiting for an async result?

---

# 14. Performance Review

Don't review performance based on aesthetics.

Look for actual algorithmic/resource risks:

### CPU

- unnecessary repeated work
- quadratic behavior
- repeated parsing
- serialization
- excessive rendering

### Memory

- retained objects
- unbounded caches
- queues
- listeners
- workers
- buffers
- large IPC payloads

### Database

- N+1 queries
- repeated queries
- missing batching
- unnecessary transactions
- excessive writes

### IPC

- event flooding
- oversized payloads
- unnecessary round trips

### Concurrency

- unbounded parallelism
- worker oversubscription
- queue growth

If the performance impact is uncertain, recommend measurement rather than asserting a performance problem.

---

# 15. Error Handling Review

Check whether errors:

- are caught appropriately
- propagate correctly
- preserve context
- leave state consistent
- trigger cleanup
- cause retries when appropriate
- avoid infinite retries
- are surfaced to the correct layer

Pay particular attention to:

```text
try
  async work
catch
  cleanup
```

and whether cleanup itself can fail.

---

# 16. Partial Failure

For multi-step operations:

```text
A
 ↓
B
 ↓
C
 ↓
D
```

ask:

> What happens if C fails?

Does the system leave:

```text
A ✓
B ✓
C ✗
D not executed
```

in a valid state?

Or does it leave corrupted/inconsistent state?

This is especially important for:

- database operations
- filesystem operations
- queue modifications
- library scanning
- metadata updates
- migrations

---

# 17. API / IPC Review

For IPC/API changes inspect:

- validation
- serialization
- response shape
- error propagation
- backwards compatibility
- caller assumptions
- lifecycle
- event frequency
- authorization/trust boundaries where applicable

A changed return value can break consumers that aren't in the diff.

---

# 18. Test Review

Don't simply ask:

> “Are there tests?”

Ask:

> “Do the tests prove the risky behavior?”

Check:

- normal behavior
- edge cases
- failure paths
- regression scenario
- concurrency
- lifecycle
- persistence
- integration behavior

For a bug fix:

> Would the test fail if I reverted the actual fix?

If not, the regression test is weak.

Also verify the tests follow Nora's testing conventions.

---

# 19. Don't Over-Flag

Not every imperfection is a review finding.

Do **not** report:

- personal style preferences
- harmless refactoring preferences
- hypothetical problems with no realistic execution path
- things already handled elsewhere
- theoretical performance concerns without evidence
- duplicate findings describing the same root cause

A finding should have:

```text
specific problem
+
credible execution path
+
meaningful consequence
```

---

# 20. Severity Classification

Use severity based on **actual impact**, not how interesting the bug is.

### P0 — Critical

Immediate severe consequence.

Examples:

- data corruption
- security-critical vulnerability
- catastrophic production failure
- unrecoverable state

### P1 — High

Major correctness/reliability problem likely to affect real users.

Examples:

- common workflow broken
- deadlock
- major race condition
- significant data loss
- startup failure
- severe memory/resource leak

### P2 — Medium

Real bug with meaningful but limited impact.

Examples:

- important edge case
- recoverable state corruption
- noticeable performance regression
- uncommon race
- missing failure handling

### P3 — Low

Minor correctness/maintainability issue with limited practical impact.

Do not inflate severity.

---

# 21. Every Finding Needs Evidence

A strong finding should answer:

```text
What?
Why?
When?
Impact?
Evidence?
Fix?
```

Example structure:

> **P1 — Transaction can deadlock under concurrent folder events**
>
> `saveFolderStructures()` starts a transaction, but the recursive lookup eventually uses the global DB connection rather than the transaction handle. When a watcher triggers overlapping saves, the transaction can wait on a connection that is itself blocked by the active transaction.
>
> **Impact:** folder processing can stall and block startup/database-dependent operations.
>
> **Recommendation:** ensure the transaction context is propagated through the entire call chain and add a regression test exercising overlapping watcher-triggered operations.

That is much stronger than:

> “Potential DB issue.”

---

# 22. Prove Findings Where Possible

If you suspect a bug:

1. inspect the execution path
2. inspect types
3. search all callers
4. reproduce if practical
5. add instrumentation if necessary
6. run a focused test
7. determine whether the issue is real

If you cannot prove it:

> **Potential P2 — ...**

and clearly explain what remains unverified.

Never present speculation as a confirmed defect.

---

# 23. Review the Negative Space

One of the most valuable review techniques:

Don't only inspect what the code does.

Inspect what it **stopped doing**.

Ask:

- Was existing cleanup removed?
- Was an await removed?
- Was an error path removed?
- Was validation bypassed?
- Was a transaction boundary changed?
- Was a previous guard removed?
- Was caching invalidation removed?
- Was an existing test deleted?
- Was behavior accidentally narrowed?

A missing operation can be more dangerous than an incorrect new operation.

---

# 24. Review Diffs Across Time

When reviewing a branch or merge:

Understand:

```text
base
 ↓
commit A
 ↓
commit B
 ↓
commit C
 ↓
current state
```

Don't review only the final snapshot if history is relevant.

Look for:

- reverted safeguards
- conflicting changes
- merge artifacts
- duplicated logic
- behavior introduced by earlier commits
- tests that no longer cover current behavior

---

# 25. Review Tests Against Production Code

Never accept:

```text
code changed
tests unchanged
```

without understanding why.

Determine whether:

- existing tests still cover the changed contract
- new behavior requires new tests
- old tests encode obsolete behavior
- the test suite has blind spots

---

# 26. Review the Fix Itself

When reviewing a bug fix, ask:

> Did this actually eliminate the mechanism that caused the bug?

Not:

> Does the new code look reasonable?

For example:

```text
Race condition
```

should not be “fixed” merely by:

```text
setTimeout(...)
```

unless timing is actually part of the intended synchronization mechanism.

Prefer structural fixes:

- ownership
- locking
- serialization
- bounded concurrency
- cancellation
- transaction scope
- state-machine correction

---

# 27. Check for New Bugs Introduced by the Fix

Every fix has a potential second-order effect.

Ask:

> What did this fix make more expensive?

> What behavior did it move?

> Did it introduce blocking?

> Did it increase memory?

> Did it change ordering?

> Did it create a new race?

> Did it change lifecycle behavior?

> Did it break another caller?

Never stop after proving the original bug is fixed.

---

# 28. Review Completeness

A feature isn't complete merely because the primary path exists.

Check whether relevant pieces were updated:

```text
implementation
tests
types
API/IPC
database
migration
UI
localization
documentation
configuration
cleanup
error handling
```

Only flag missing areas when they're actually relevant.

---

# 29. Final Review Procedure

Before producing the final review:

```text
1. Understand requested change
2. Inspect diff
3. Inspect surrounding architecture
4. Trace important call/data paths
5. Check tests
6. Identify invariants
7. Attack assumptions
8. Check concurrency
9. Check failure paths
10. Check persistence/DB
11. Check performance
12. Check lifecycle
13. Check compatibility
14. Check regression coverage
15. Validate suspected findings
16. Classify severity
17. Remove speculative/duplicate findings
18. Re-check the entire change
19. Produce final verdict
```

---

# 30. Final Review Output

Use a consistent structure:

```text
## Verdict

[APPROVE / APPROVE WITH NOTES / CHANGES REQUIRED]

## Findings

### P1 — ...
Evidence:
...

Impact:
...

Recommendation:
...

### P2 — ...
...

## What I Verified

- ...
- ...
- ...

## Remaining Uncertainty

- ...

## Test / Verification Status

- ...
```

If there are no real findings, say:

> **No actionable correctness issues found.**

Do **not** manufacture P3 findings just to make the review look thorough.

---


