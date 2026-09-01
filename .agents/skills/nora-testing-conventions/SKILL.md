---
name: nora-testing-conventions
description: Conventions and guidelines for test file organization, structure, and naming in the Nora project.
---

# Nora Testing Conventions

> **Establishing consistent test file organization and structure for the Nora Music Player project.**

## Overview

This skill defines the testing conventions for Nora to ensure consistency, maintainability, and clear organization of test files across the codebase.

## Core Principles

1. **Mirror Source Structure**: Test files must mirror the source directory structure
2. **One Test File Per Source File**: Each test file tests exactly one source file
3. **Clear Naming**: Test files use the same name as the source file with `.test.ts` suffix
4. **Integration Tests**: Separate directory for tests that span multiple files

## Directory Structure Mapping

### Source to Test Mapping

**Pattern**: `src/{path}/{file}.ts` → `test/src/{path}/{file}.test.ts`

**Examples**:

| Source File                                        | Test File                                                    |
| -------------------------------------------------- | ------------------------------------------------------------ |
| `src/main/fs/getParentFolderPaths.ts`              | `test/src/main/fs/getParentFolderPaths.test.ts`              |
| `src/main/filesystem.ts`                           | `test/src/main/filesystem.test.ts`                           |
| `src/main/fs/parseFolderStructuresForSongPaths.ts` | `test/src/main/fs/parseFolderStructuresForSongPaths.test.ts` |
| `src/renderer/src/utils/helpers.ts`                | `test/src/renderer/src/utils/helpers.test.ts`                |
| `src/common/parseLyrics.ts`                        | `test/src/common/parseLyrics.test.ts`                        |

### Current Test Directory Structure

```
test/
├── setup.ts                                          # Vitest setup
├── assets/                                           # Test fixtures and data
├── integration/                                      # Full integration tests
├── src/
│   ├── common/                                       # Tests for src/common/
│   │   └── parseLyrics.test.ts
│   ├── main/
│   │   ├── fs/                                       # Tests for src/main/fs/
│   │   │   ├── getParentFolderPaths.test.ts
│   │   │   ├── parseFolderStructuresForSongPaths.test.ts
│   │   │   └── ...
│   │   ├── filesystem.test.ts                        # Tests for src/main/filesystem.ts
│   │   ├── ipc.test.ts                               # Tests for src/main/ipc.ts
│   │   └── ...
│   ├── renderer/
│   │   └── src/
│   │       ├── utils/
│   │       │   └── helpers.test.ts
│   │       ├── hooks/
│   │       │   └── useAudioPlayer.test.ts
│   │       └── ...
│   └── types/                                        # (if testing type definitions)
└── integration/                                      # Cross-file integration tests
    ├── pathHandling.test.ts                          # Filesystem operations end-to-end
    ├── libraryManagement.test.ts                     # Multi-file library workflows
    └── ...
```

## Test File Organization Guidelines

### Single Source File Tests

**Rule**: Each test file tests **exactly one** source file.

```typescript
// ✅ CORRECT: test/src/main/fs/getParentFolderPaths.test.ts
// Tests ONLY: src/main/fs/getParentFolderPaths.ts

import { describe, it, expect } from 'vitest';
import { getParentFolderPaths } from '@main/fs/getParentFolderPaths';

describe('getParentFolderPaths', () => {
  it('should handle single absolute path', () => {
    // ...
  });
});
```

### Integration Tests (Multiple Source Files)

**Location**: `test/integration/` or `test/src/{area}/` with `.integration.test.ts` suffix

**Rule**: Tests interactions between multiple source files

```typescript
// ✅ CORRECT: test/integration/pathHandling.test.ts
// Tests: Interactions between getParentFolderPaths, filesystem, fs.watch(), etc.

import { describe, it, expect } from 'vitest';
import { getParentFolderPaths } from '@main/fs/getParentFolderPaths';
import { ensureWatched } from '@main/fs/addWatchersToParentFolders';

describe('Filesystem Path Handling Integration', () => {
  it('should watch parent folders of added music paths', () => {
    // Tests interaction between multiple modules
  });
});
```

## Test File Creation Checklist

When creating a new test file:

- [ ] Source file identified: `src/{path}/{file}.ts`
- [ ] Test directory created: `test/src/{path}/`
- [ ] Test file created: `test/src/{path}/{file}.test.ts`
- [ ] Only one source file being tested
- [ ] Imports from the single source file
- [ ] Top-level `describe()` block names the module
- [ ] No imports from other test files
- [ ] File follows Vitest patterns documented in project

## Test File Naming

| Scenario                  | Pattern                             | Example                            |
| ------------------------- | ----------------------------------- | ---------------------------------- |
| Unit test for single file | `{filename}.test.ts`                | `getParentFolderPaths.test.ts`     |
| Integration test          | `{feature}.integration.test.ts`     | `pathHandling.integration.test.ts` |
| Edge case variations      | `{filename}.test.ts` (in same file) | Add multiple describe blocks       |

## Common Mistakes to Avoid

❌ **Multiple Source Files in One Test**

```typescript
// WRONG: Testing two files in one test file
describe('Filesystem utilities', () => {
  describe('getParentFolderPaths', () => {
    /* ... */
  });
  describe('parseFolderStructures', () => {
    /* ... */
  });
});
```

✅ **Separate Test Files**

```typescript
// CORRECT: Each file has its own test
// test/src/main/fs/getParentFolderPaths.test.ts
describe('getParentFolderPaths', () => {
  /* ... */
});

// test/src/main/fs/parseFolderStructuresForSongPaths.test.ts
describe('parseFolderStructuresForSongPaths', () => {
  /* ... */
});
```

❌ **Wrong Directory Structure**

```
test/
├── pathHandling.test.ts  // WRONG: Should be in test/src/main/fs/
├── filesystemUtils.test.ts  // WRONG: Should be in test/src/main/
```

✅ **Correct Directory Structure**

```
test/
├── src/
│   └── main/
│       ├── fs/
│       │   └── getParentFolderPaths.test.ts
│       └── filesystem.test.ts
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests for specific directory
npm test test/src/main/fs/

# Run single test file
npm test test/src/main/fs/getParentFolderPaths.test.ts

# Run integration tests
npm test test/integration/

# Run with coverage
npm run coverage
```

## Related Documentation

- **Nora copilot-instructions.md**: Main project architecture and patterns
- **TanStack Query Patterns Skill**: Data fetching conventions
- **Vitest Configuration**: `vitest.config.ts` in project root

## Examples by Module

### Main Process Tests (`test/src/main/`)

```typescript
// test/src/main/fs/getParentFolderPaths.test.ts
import { describe, it, expect } from 'vitest';
import { getParentFolderPaths } from '@main/fs/getParentFolderPaths';

describe('getParentFolderPaths', () => {
  describe('absolute paths', () => {
    it('should preserve leading slash', () => {
      const result = getParentFolderPaths(['/home/music']);
      expect(result[0].startsWith('/')).toBe(true);
    });
  });
});
```

### Renderer Tests (`test/src/renderer/`)

```typescript
// test/src/renderer/src/hooks/useAudioPlayer.test.ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAudioPlayer } from '@renderer/hooks/useAudioPlayer';

describe('useAudioPlayer', () => {
  it('should initialize player', () => {
    const { result } = renderHook(() => useAudioPlayer());
    expect(result.current).toBeDefined();
  });
});
```

### Common Module Tests (`test/src/common/`)

```typescript
// test/src/common/parseLyrics.test.ts
import { describe, it, expect } from 'vitest';
import { parseLyrics } from '@common/parseLyrics';

describe('parseLyrics', () => {
  it('should detect synced lyrics', () => {
    const result = parseLyrics('[00:12.00]Line 1');
    expect(result.isSynced).toBe(true);
  });
});
```

## Integration Test Guidelines

Place integration tests in `test/integration/` when:

- Testing interactions between 2+ source modules
- Testing end-to-end workflows
- Testing IPC communication
- Testing file system operations with multiple watchers

```typescript
// test/integration/fileWatching.test.ts
// Tests: getParentFolderPaths + addWatchersToParentFolders + fs.watch()
```

## Maintenance

When refactoring source files:

1. Ensure test file path matches new source path
2. Update imports if module moves
3. Keep test file 1:1 with source file
4. Move tests to integration/ if they now need multiple files

---

## Nora — AI Testing Engineering Rules

### 1. Tests must prove behavior, not implementation

Write tests around the externally observable contract of the source module.

Prefer:

```ts
expect(result).toEqual(expected);
```

over assertions about internal implementation details unless the internal behavior itself is the contract.

Avoid tests that merely prove:

- a particular helper was called
- a particular internal variable exists
- a specific implementation branch executed
- a particular library API was invoked

unless that interaction is itself important behavior.

**A test should fail when the behavior becomes incorrect, not merely when the implementation changes.**

---

### 2. First understand the contract

Before writing tests for a module, inspect:

- the implementation
- callers
- types
- existing tests
- related utilities
- error behavior
- lifecycle behavior
- relevant configuration

Determine:

1. What does this module promise?
2. What inputs does it accept?
3. What outputs does it produce?
4. What side effects does it have?
5. What errors can occur?
6. What invariants must always hold?
7. What behavior must remain stable during refactoring?

Do not blindly derive tests from the current implementation.

---

# 3. Test the boundaries

For every meaningful function/module, consider at least:

### Normal cases

- typical valid input
- multiple valid inputs
- expected common workflows

### Boundary cases

- empty input
- one item
- maximum/reasonably large input
- zero
- first/last element
- missing optional values

### Invalid cases

- malformed input
- unsupported values
- missing resources
- invalid state

### Failure cases

- filesystem failure
- database failure
- network failure
- dependency failure
- timeout
- rejected promise

Only include cases relevant to the module.

Do not mechanically create dozens of meaningless edge-case tests.

---

# 4. Tests should encode invariants

For important algorithms and stateful systems, identify invariants before writing tests.

Examples:

```text
Queue position must always remain within queue bounds.
```

```text
A folder watcher must never be registered twice for the same path.
```

```text
A database transaction must not perform transaction-dependent work through the global DB connection.
```

```text
Removing an item from the queue must not change the relative ordering of remaining items.
```

Tests should protect these invariants directly.

---

# 5. Regression tests are mandatory for confirmed bugs

Whenever a bug is fixed:

**Add a regression test whenever technically practical.**

The preferred sequence is:

```text
Bug
 ↓
Reproduce
 ↓
Test fails
 ↓
Fix
 ↓
Test passes
```

A regression test should reproduce the actual failure mechanism, not merely test the new implementation.

For concurrency bugs, the regression test should exercise the relevant concurrency.

For persistence bugs, it should exercise persistence.

For lifecycle bugs, it should exercise lifecycle transitions.

---

# 6. Don't write weak regression tests

Avoid:

```ts
it('does not crash', ...)
```

when the actual bug was incorrect state.

Avoid:

```ts
expect(result).toBeDefined();
```

when meaningful correctness can be asserted.

Avoid tests that pass even if the original bug is reintroduced.

Ask:

> If I intentionally reverted the fix, would this test fail?

If not, the regression test is probably insufficient.

---

# 7. Test failures, not just successes

For every operation that can fail, consider:

```text
success
failure
partial failure
retry
cancellation
cleanup
recovery
```

For async operations specifically consider:

- rejected promises
- concurrent calls
- duplicate calls
- cancellation
- ordering
- cleanup after failure

---

# 8. Async tests must actually synchronize

Never rely on timing accidentally making a test pass.

Avoid arbitrary:

```ts
await new Promise((resolve) => setTimeout(resolve, 100));
```

unless testing actual time-dependent behavior.

Prefer explicit synchronization:

- awaited promises
- deferred promises
- controlled mocks
- fake timers
- observable state transitions
- deterministic barriers

Tests must not depend on machine speed.

---

# 9. Concurrency tests must create concurrency

Do not call an async function twice sequentially and claim concurrency was tested.

Weak:

```ts
await operation();
await operation();
```

Strong:

```ts
await Promise.all([operation(), operation()]);
```

For more complex races, deliberately control execution ordering.

Example:

```text
Operation A starts
Operation A blocks
Operation B starts
Operation B reaches shared resource
Operation A resumes
Verify invariant
```

If a race condition is the bug, the test must actually reproduce the race.

---

# 10. Stress tests are different from unit tests

Use stress tests when correctness depends on:

- large queues
- thousands of files
- many concurrent operations
- large libraries
- rapid event generation
- repeated state transitions
- high-volume IPC
- worker pools
- filesystem watchers

Do not turn every unit test into a stress test.

Keep:

```text
unit tests → fast, deterministic
integration tests → realistic interactions
stress tests → scale/concurrency/resource behavior
```

---

# 11. Performance tests must have meaningful workloads

For performance-sensitive changes:

1. Establish a baseline.
2. Define the workload.
3. Measure the relevant metric.
4. Make the change.
5. Measure again.
6. Compare.

Relevant metrics may include:

- execution time
- throughput
- memory
- CPU
- allocations
- database queries
- IPC messages
- render count
- queue depth

Never claim a performance improvement based only on code inspection.

---

# 12. Avoid over-mocking

Mocks should isolate genuine external boundaries.

Do not mock everything simply because it makes tests easier.

Over-mocking can produce tests where:

> every assumption is mocked and nothing real is verified.

Prefer real implementations for:

- pure utilities
- simple transformations
- deterministic internal logic

Mock external systems when appropriate:

- filesystem
- database
- network
- Electron APIs
- OS integrations
- expensive external services

---

# 13. Mock behavior, not implementation

Mocks should represent what the dependency does, not mirror its private implementation.

Bad:

```ts
mockFn.mockImplementation(() => internalImplementationDetail);
```

Better:

```ts
mockFn.mockResolvedValue(expectedExternalResult);
```

The test should remain useful if the dependency's internal implementation changes.

---

# 14. Integration tests must justify their existence

Use an integration test when correctness depends on multiple components working together.

Examples:

```text
scanner → metadata parser → database
```

```text
filesystem watcher → folder manager → database
```

```text
IPC handler → service → persistence
```

```text
queue API → store → player
```

Don't put a unit test into `integration/` merely because it is large.

---

# 15. Unit-test boundaries and integration-test contracts

A useful rule:

> Unit tests verify individual behavior. Integration tests verify collaboration.

For example:

### Unit

```text
parseFolderStructuresForSongPaths()
```

### Integration

```text
filesystem change
→ watcher
→ folder discovery
→ metadata processing
→ DB update
→ UI-visible state
```

The integration test should verify the important contract between those components rather than duplicate every unit assertion.

---

# 16. Test state transitions

For stateful Nora systems, test transitions rather than only final state.

Example:

```text
idle
 ↓
scanning
 ↓
processing
 ↓
completed
```

Also:

```text
scanning
 ↓
cancelled
```

```text
processing
 ↓
error
 ↓
recovery
```

```text
playing
 ↓
queue changed
 ↓
next track
```

The transition itself may contain the bug.

---

# 17. Test lifecycle behavior

For long-lived Nora processes, explicitly consider:

- initialization
- repeated initialization
- shutdown
- cleanup
- restart
- subscription registration
- subscription removal
- watcher creation
- watcher cleanup
- worker creation
- worker termination

A module that works once but leaks resources after repeated initialization is not correct.

---

# 18. Database tests must respect real transaction semantics

When testing DB code, don't automatically mock the database.

For transaction-sensitive behavior, prefer a realistic database environment where practical.

Test:

- transaction success
- rollback
- concurrent operations
- constraint violations
- duplicate operations
- partial failure
- transaction-scoped queries

Especially verify that code does not accidentally mix:

```text
transaction connection
```

with:

```text
global connection
```

inside a transaction.

---

# 19. Filesystem tests should use realistic paths

Filesystem-related tests should consider:

- Windows paths
- POSIX paths
- separators
- relative paths
- absolute paths
- nested folders
- spaces
- Unicode
- duplicate paths
- missing files
- missing folders
- inaccessible paths

Since Nora runs on desktop systems, don't accidentally make tests Linux-only.

---

# 20. Test large inputs where algorithms claim scalability

If code is expected to operate on:

- thousands of songs
- tens of thousands of paths
- large queues
- large metadata sets

include appropriately sized tests or stress suites.

A function that works for 10 items but becomes quadratic for 50,000 items is not necessarily correct for Nora.

---

# 21. Determinism is a requirement

Tests should be:

- deterministic
- isolated
- repeatable
- order-independent unless ordering is part of the contract

A test that passes 99/100 runs is a broken test.

Never dismiss flaky tests as “probably CI.”

Investigate them.

---

# 22. Don't weaken production code just to make tests easy

If testing a component is difficult, first ask whether the architecture itself has an unnecessary coupling.

But don't automatically refactor production code solely to make a test convenient.

Possible approaches:

1. test through the public API
2. introduce a legitimate abstraction
3. inject a real dependency boundary
4. use integration testing
5. only then consider targeted refactoring

Tests should not dictate bad production architecture.

---

# 23. Test the public contract

Prefer testing exported/public behavior.

Don't export private functions solely so they can be tested.

If an internal algorithm is important enough to require direct testing, consider whether it deserves a legitimate module boundary.

---

# 24. Test organization remains strict

Your existing convention remains authoritative:

```text
src/foo/bar.ts
        ↓
test/src/foo/bar.test.ts
```

One source file per unit-test file.

Integration tests belong separately.

Do not import another test file.

Do not create miscellaneous test files such as:

```text
utils.test.ts
helpers.test.ts
misc.test.ts
bugFixes.test.ts
```

when the tests clearly belong to specific source modules.

---

# 25. Test names should describe behavior

Prefer:

```ts
it('preserves queue order when removing the current track');
```

over:

```ts
it('works correctly');
```

Prefer:

```ts
it('reuses an existing watcher when the same folder is registered twice');
```

over:

```ts
it('handles duplicate folders');
```

A test name should explain **what contract is being protected**.

---

# 26. Don't test implementation snapshots blindly

Snapshots can be useful for stable UI structures, but don't use snapshots as a substitute for understanding behavior.

For important logic, explicit assertions are generally preferable.

---

# 27. Coverage is a signal, not proof

High coverage does not mean high correctness.

A test suite can have:

```text
100% line coverage
```

and still completely miss:

- race conditions
- incorrect ordering
- rollback bugs
- stale state
- memory leaks
- lifecycle bugs

Use coverage to discover untested areas, not to declare correctness.

---

# 28. When changing existing behavior, inspect existing tests first

Before modifying a module:

1. find its test
2. understand what behavior is already protected
3. determine whether existing tests encode outdated behavior
4. update tests only when the intended contract changes
5. add regression coverage for the new behavior

Never blindly rewrite tests just to make the new implementation pass.

---

# 29. Test the smallest meaningful surface

Don't duplicate the same assertion across:

- unit test
- integration test
- stress test

unless each test protects a different contract.

Each test should have a reason to exist.

---

# 30. Final Test Audit

Before declaring a change complete, ask:

```text
□ Does a test exist for the changed behavior?
□ Does it test the actual contract?
□ Would it fail if the bug were reintroduced?
□ Are important boundary cases covered?
□ Are failure cases covered?
□ Are concurrency concerns covered?
□ Are lifecycle concerns covered?
□ Are large-input concerns relevant?
□ Is the test deterministic?
□ Is mocking appropriate?
□ Is the test in the correct location?
□ Does it obey Nora's 1-source-file-per-test-file convention?
□ Are integration tests separated correctly?
□ Did the relevant test suite actually run?
```

---

## And I'd add one particularly important rule for your agent

Because of the kind of bugs you've already found in Nora, I'd make this **very explicit**:

> **When a bug involves concurrency, transactions, event watchers, asynchronous work, queues, lifecycle, caching, or state synchronization, do not accept a unit test that only verifies the final happy-path result. The test must exercise the relevant interaction, ordering, overlap, failure, or lifecycle condition that made the bug possible.**

That would have directly helped with things like the **PGlite transaction/global-DB deadlock**, watcher storms, queue races, and similar issues you've been investigating.

### The bigger structure I'd use

You now effectively have two layers:

```text
GLOBAL AI ENGINEERING INSTRUCTIONS
│
├── Reasoning
├── Investigation
├── Architecture
├── Design
├── Planning
├── Implementation
├── Debugging
├── Performance
├── Concurrency
├── Database
├── Git
├── Communication
└── Verification
        │
        ▼
NORA PROJECT CONVENTIONS
│
├── Testing conventions
├── TanStack Query patterns
├── Architecture conventions
├── Database conventions
├── IPC conventions
├── React conventions
├── Queue conventions
└── Other project-specific rules
```

That's much stronger than putting every Nora-specific rule into the global prompt.

**Global instructions teach the agent how to think.**  
**Nora instructions teach it how Nora works.**

And I would keep those separate. That way your global agent becomes genuinely strong across projects, while the Nora skill acts as the project's local engineering constitution.
