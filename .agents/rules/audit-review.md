# Audit Review Instructions

This audit is an input for verification, not an implementation specification.

For every reported finding:

1. **Verify the issue against the current codebase before making any changes.**
   * Do not assume every finding is still valid.
   * Ignore findings already fixed in the current branch.

2. **Classify each finding before fixing it:**
   * ✅ Confirmed Bug
   * ❌ Already Fixed
   * ⚠️ Design Choice / Not a Bug
   * ❓ Unable to Verify

3. **Only modify code for confirmed defects.**
   * Do not perform opportunistic refactoring.
   * Do not redesign the architecture while fixing bugs.

4. **Preserve the existing architecture:**
   * Repository → Operations → Engine → IPC → Renderer
   * Do not move business logic across layers.
   * Keep transactions, undo/redo, event bus, and repository responsibilities unchanged unless a confirmed bug requires a targeted fix.

5. **For each confirmed bug:**
   * Explain the root cause.
   * Describe the fix.
   * State whether any public API or behavior changed.
   * Add or update automated tests that reproduce the bug and verify the fix.

6. **After all fixes:**
   * Run the relevant unit and integration tests.
   * Report which findings were:
     * Fixed
     * Already resolved
     * Rejected (with justification)

---

## Specific areas to verify carefully

Pay particular attention to:

* Decimal/string handling in statistics calculations.
* Undo/redo journal integrity and redo-branch pruning.
* OperationRegistry registrations.
* IPC handler method names.
* DTO mapping correctness.
* MembershipService construction.
* `CollectionId` formatting.
* Event payload correctness.
* Statistics propagation after merge/delete/restore.
* Duplicate position allocation.

---

## Do NOT

* Redesign the IPC layer.
* Replace the undo architecture.
* Introduce new abstractions unless required to fix a confirmed bug.
* Change public APIs unnecessarily.
* Perform unrelated cleanup.

---

## Deliverable

For every audit item, provide a table similar to:

| Audit Item                 | Status        | Action                                                           |
| -------------------------- | ------------- | ---------------------------------------------------------------- |
| #1 Decimal duration bug    | Fixed         | Parsed decimal values before aggregation; added regression test. |
| #2 DuplicateOp constructor | Already Fixed | Current implementation already matches constructor signature.    |
| #3 IPC getChildren         | Not a Bug     | Current `HierarchyService` exposes the expected API.             |

Include any newly added regression tests and summarize the final test results.
