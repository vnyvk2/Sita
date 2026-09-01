---
name: upstream-sync
description: Safe workflow for auditing upstream sustainability, assessing architectural impact, and selectively porting/merging upstream changes into the heavily diverged private Nora repository without pushing to origin/upstream.
---

# Upstream Sustainability Audit & Sync Workflow Skill

## 1. Core Operating Philosophy: Audit First, Merge Never Blindly

In a heavily diverged codebase, **blind 3-way merges are prohibited**.
Upstream code assumes an architecture that our private codebase may have completely rewritten, decoupled, or deprecated.

Whenever an upstream update, branch, or commit is mentioned:

1. **Never auto-merge or apply code immediately.**
2. **Perform a Zero-Touch Sustainability & Impact Audit** to analyze every affected line and architectural dependency.
3. **Classify changes into sustainability tiers** (Clean Port, Adapted Port, Architectural Conflict / Incompatible).
4. **Present findings with code-level impact analysis** before taking any action.

---

## 2. Remote Topology & Hard Boundaries

| Remote     | URL                                    | Role                 | Push Permission                          | Fetch Policy                                                                 |
| ---------- | -------------------------------------- | -------------------- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| `upstream` | `https://github.com/Sandakan/Nora.git` | Original source repo | **BLOCKED** (`DISABLE_PUSH_TO_UPSTREAM`) | **On-demand explicit branch only** (`skipFetchAll=true`, `tagOpt=--no-tags`) |
| `origin`   | `https://github.com/vnyvk2/Nora.git`   | Public fork          | **BLOCKED** (`DISABLE_PUSH_TO_ORIGIN`)   | Read-only                                                                    |
| `private`  | `https://github.com/vnyvk2/MyNora.git` | Private repository   | **ALLOWED** (Only push target)           | Primary default                                                              |

> [!CRITICAL]
>
> 1. Pushes to `origin` and `upstream` MUST remain blocked.
> 2. NEVER run bare `git fetch upstream` or fetch all branches/tags globally. Fetch ONLY the specific branch requested.

---

## 3. Zero-Touch Sustainability & Impact Audit Protocol

When asked to check, review, or evaluate an upstream branch, follow this 5-step audit process:

### Step 1: Isolated On-Demand Fetch (Zero-Touch)

Fetch ONLY the target branch from upstream without touching the current working tree or branches:

```bash
# Fetch ONLY the specified branch
git fetch upstream <upstream-branch-name>
```

### Step 2: Compute Merge Base & Isolated Upstream Diff

Determine the exact delta that upstream introduced relative to the common ancestor:

```bash
# 1. Identify common ancestor commit
MERGE_BASE=$(git merge-base master upstream/<upstream-branch-name>)

# 2. List all upstream commits since the divergence point
git log $MERGE_BASE..upstream/<upstream-branch-name> --oneline --graph

# 3. View list of modified files in upstream
git diff --stat $MERGE_BASE upstream/<upstream-branch-name>

# 4. Inspect detailed diff of upstream changes
git diff $MERGE_BASE upstream/<upstream-branch-name>
```

### Step 3: Deep Core Impact Mapping (Adversarial Audit)

For every file and logic block changed upstream, audit against our private codebase:

1. **Subsystem & Core Architecture Check:**
   - Did upstream touch core modules that we heavily customized (e.g. Electron main/renderer processes, IPC protocols, custom state management, audio/rendering engines, database schemas)?
   - Does upstream rely on deprecated APIs, libraries, or conventions that we eliminated?

2. **Call-Site & Dependency Audit:**
   - Trace all callers and callees of modified functions.
   - Did upstream modify function signatures or return types that our private code depends upon?

3. **Concurrency & Lifecycle Audit:**
   - Does the upstream change alter component lifecycles, event listener registrations, async queues, or IPC channels?
   - Is there risk of memory leaks or race conditions in our custom environment?

### Step 4: Classify Each Upstream Change

Categorize every upstream change into one of three action categories:

| Category                      | Definition                                                                                              | Recommendation                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 🟢 **Clean Port**             | Standalone utility, bugfix, or non-conflicting dependency update that fits directly.                    | Safe to cherry-pick or directly adapt.                                     |
| 🟡 **Adapted Port**           | High-value logic or feature, but deeply conflicts with our core architecture.                           | Rewrite / re-implement using our private APIs, state stores, and patterns. |
| 🔴 **Architectural Conflict** | Upstream assumes legacy patterns, rewrites systems we already redesigned, or introduces technical debt. | **Reject / Skip**. Document why it is unsustainable.                       |

### Step 5: Sustainability & Impact Report Structure

Produce a structured engineering report for the user:

```markdown
# Upstream Impact & Sustainability Audit: `<upstream-branch>`

## 1. Executive Verdict

[Verdict: Safe to Adapt / Requires Significant Adaptation / Incompatible & Reject]

## 2. Upstream Summary

- Commits analyzed: X
- Files modified: Y
- Core subsystems touched: [List of subsystems]

## 3. Subsystem-by-Subsystem Architectural Impact

- **[Component A]**:
  - _Upstream Intent:_ ...
  - _Our Divergent State:_ ...
  - _Conflict Severity:_ [High / Medium / Low]
  - _Impact on Private Code:_ ...

## 4. Sustainability & Regression Risks

- [Risk 1: State management / IPC breakdown]
- [Risk 2: Lifecycle or concurrency race condition]
- [Risk 3: Build or dependency incompatibility]

## 5. Recommended Action & Adaptation Plan

- [ ] Port cleanly: `git cherry-pick ...`
- [ ] Adapt & rewrite: Custom implementation plan for [Module]
- [ ] Reject / Ignore: [List of upstream commits to bypass]
```

---

## 4. Execution Workflow (When User Approves Porting/Sync)

Only proceed with code integration after the user reviews and approves the audit report:

1. **Stash / Protect Local WIP:**
   ```bash
   git stash -u -m "WIP before upstream port"
   ```
2. **Create Isolated Integration Branch:**
   ```bash
   git checkout master
   git pull private master
   git checkout -b sync/upstream-<feature-name>
   ```
3. **Apply Changes via Selective Adaptation / Cherry-Pick:**
   - For Clean Ports: `git cherry-pick <commit-hash>`
   - For Adapted Ports: Manually implement logic conforming to our private architecture.
4. **Verify Quality Gates:**
   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run build
   ```
5. **Push Exclusively to Private Remote:**
   ```bash
   git push private sync/upstream-<feature-name>
   ```
6. **Restore WIP:**
   ```bash
   git checkout master
   git stash pop
   ```

---

## 5. Summary of Strict Rules

1. **Default Mode is Audit, NOT Merge.** Never touch working tree or merge without explicit request.
2. **Fetch On-Demand Only:** `git fetch upstream <specific-branch>`. No auto-fetching all branches or tags.
3. **Pushes Strictly Private:** `origin` and `upstream` pushes are permanently disabled.
4. **Preserve Private Architecture:** Never let upstream overwrite core custom architecture.
