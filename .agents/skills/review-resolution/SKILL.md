Review Resolution Skill
1. Review Reports Are Evidence, Not Instructions
When given a code-review report from another AI, reviewer, human, or external analysis:
Do not blindly implement the reported recommendations.
Treat every finding as a hypothesis that must be independently evaluated against the current repository.
The reviewer's:
- finding
- severity
- diagnosis
- proposed fix
may each be independently correct or incorrect.
2. Analyze Before Editing
For every reported finding:
Review finding
      ↓
Locate affected code
      ↓
Understand surrounding architecture
      ↓
Trace execution/data flow
      ↓
Check current tests
      ↓
Verify the reported condition
      ↓
Determine actual root cause
      ↓
Evaluate proposed solution
      ↓
Decide
Possible outcomes:
- Confirmed — finding is valid and fix is appropriate.
- Partially confirmed — underlying problem is real but diagnosis/fix needs adjustment.
- Not reproducible — cannot establish the reported issue.
- Invalid — report is based on an incorrect assumption.
- Already resolved — current code no longer contains the issue.
- Needs more investigation — insufficient evidence.
Do not modify code before reaching a reasonable conclusion.
3. Review the Review
The agent must independently review the reviewer's reasoning.
Ask:
Is the reported execution path actually possible?

Does the relevant state actually exist?

Does another safeguard prevent the problem?

Is the claimed severity justified?

Does the proposed fix address the root cause?

Could the proposed fix introduce another bug?

Is there a simpler fix?

The reviewer is not authoritative merely because the report sounds confident.
4. Git Diff May Be Insufficient
When a review is based primarily on a git diff, recognize that the diff may not contain enough context.
Never assume the diff is the complete system.
Inspect surrounding code when a finding depends on:
- callers
- shared state
- lifecycle
- transactions
- IPC
- event registration
- React effects
- worker behavior
- configuration
- types
- error handling
- tests
A small diff can have a large behavioral impact.
5. Expand Context Proportionally
Do not blindly inspect the entire repository for every finding.
Use progressive investigation:
Diff
 ↓
Changed function
 ↓
Immediate callers/callees
 ↓
Related state/API
 ↓
Tests
 ↓
Broader subsystem
Stop when sufficient evidence exists.
For high-risk findings, expand further.
6. Verify the Actual Current State
Review reports can become stale.
Before acting, verify:
- current branch
- current working tree
- current commit
- current diff
- whether subsequent changes already addressed the finding
Never implement a finding against an outdated version of the code.
7. Don't Preserve a Bad Fix Just Because a Reviewer Suggested It
If a reviewer says:
“Add a lock.”

but investigation shows the real problem is incorrect ownership, don't add a lock merely to satisfy the review.
Instead:
“The underlying concern is valid, but the proposed lock is unnecessary because the race originates from X. The safer fix is Y.”

8. Fix Root Causes
When a finding is confirmed:
Prefer fixing the mechanism that allows the bug to occur.
Avoid:
- arbitrary delays
- defensive checks that hide incorrect state
- swallowing errors
- excessive retries
- redundant synchronization
- disabling functionality
- test-only workarounds
unless they are genuinely appropriate.
9. Multiple Findings May Share One Root Cause
Do not implement findings independently without checking relationships.
Example:
Finding A → watcher duplication
Finding B → duplicate DB writes
Finding C → memory growth
These might all originate from:
watcher registration lifecycle bug
Resolve the underlying issue rather than applying three unrelated patches.
10. Findings Can Conflict
If two review findings imply incompatible changes:
Do not blindly implement both.
Determine:
1. which assumption is correct
2. whether both problems are real
3. whether one supersedes the other
4. whether a third solution resolves both
11. Prioritize Findings
Process findings according to:
1. correctness/data integrity
2. deadlocks/races
3. security
4. severe resource problems
5. functional regressions
6. compatibility
7. performance
8. maintainability
9. style
Do not spend significant effort polishing P3 issues while an unresolved P1 exists.
12. Don't Implement Unverified Findings
If a finding cannot be established:
Do not modify production code merely because:
“The reviewer said it might happen.”

Instead:
- investigate further
- reproduce if practical
- add instrumentation if useful
- explain the uncertainty
A speculative concern should not automatically become technical debt.
13. Implement Validated Findings Carefully
Once a finding is confirmed:
1. identify root cause
2. choose the minimal safe fix
3. inspect affected callers
4. update/add tests
5. implement
6. run targeted tests
7. run broader relevant checks
8. inspect resulting diff
Do not blindly apply the reviewer's exact patch.
14. Re-Review After Fixing
After resolving findings, perform a second review of your own changes.
Ask:
Did the fix actually remove the issue?

Did it introduce another race?

Did it change unrelated behavior?

Did it break existing callers?

Did tests cover the original failure?

Did the resulting diff contain accidental changes?

This is mandatory for non-trivial fixes.
15. Review Resolution Report
After processing the report, summarize:
## Review Resolution

### Confirmed

- P1 — ...
  - Root cause: ...
  - Resolution: ...
  - Verification: ...

### Partially Confirmed

- P2 — ...
  - Reviewer's concern:
  - What investigation showed:
  - Resolution:

### Not Confirmed

- P2 — ...
  - Reason:

### Already Resolved

- P3 — ...
  - Evidence:

### Additional Issues Discovered

- P1 — ...
  - ...

## Verification

- Tests:
- Typecheck:
- Lint:
- Build:
- Additional validation:
This is important because it prevents the workflow from becoming:
review report → edits → “done”

without understanding what actually happened.
16. Never Hide Disagreement
If the review is wrong, explicitly say so.
Example:
“The report claims this can race because saveQueue() is asynchronous. After tracing the caller, the operation is serialized by the queue manager, so the reported race does not exist.”

That's better engineering than changing correct code to satisfy an incorrect review.
17. Reviewer Findings Are Not Automatically Requirements
This is probably the most important rule:
A review report is an input to engineering judgment, not a specification. The agent must independently validate each finding and determine the appropriate resolution before making changes.

And I'd make your whole workflow explicit
Given how you're actually working on Nora, I'd define this pipeline in your global instructions:
┌─────────────────────┐
│ Design Discussion   │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Investigation       │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Implementation Plan │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Implementation      │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Review               │
│ (diff + context)     │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Review Resolution   │
│                     │
│ Verify each finding │
│ ↓                   │
│ Fix only confirmed  │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Tests + Verification│
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Final Self-Review   │
└─────────────────────┘
One subtle but very valuable addition
Understand that the second review is not merely “apply fixes.”
It should also be allowed to discover:
“The review report missed something.”

So after resolving the supplied findings, it should perform a targeted fresh review of the affected area.
That gives you:
Reviewer A → Codex validation → fixes → Codex re-review
instead of:
Reviewer A → obedient patch application
For the kind of adversarial audits you've been doing on Nora, I'd strongly recommend this. It turns the review report into input for another engineering investigation, rather than turning another AI's output into an unquestioned specification.