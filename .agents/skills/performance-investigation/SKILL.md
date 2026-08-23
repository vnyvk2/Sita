---
name: performance-investigation
description: Rigorous methodology for investigating memory leaks, UI render cascades, lifecycle transitions, and process-level performance across Electron and Chromium architectures.
---

# Performance Investigation Skill — Nora

## 0. Core Operating Principle

> **Never confuse a "Large Working Set" with a "Memory Leak". A memory leak requires empirical evidence of persistent, monotonic, or unbounded growth across repeated lifecycle transitions. Distinguish warm runtime allocation plateaus from application resource leaks, and avoid measurement illusions.**

---

## 1. The Investigation Hierarchy & Decision Flow

When analyzing memory and performance, do not treat OS Working Set as an immediate indicator of a JavaScript bug. Follow this strict investigation flow:

```text
               "Task Manager reports high Working Set (e.g. 480 MB)"
                                       │
                                       ▼
                       Is V8 JS Heap growing monotonically?
                          /                         \
                        YES                          NO
                        │                             │
          Application JS Memory Leak          Check DOM Nodes (CDP Nodes)
          (retained closures/Redux/caches)            │
                                              Check JS Event Listeners (CDP)
                                                      │
                                              Check Active Subscriptions & Timers
                                                      │
                                              Check GPU / Viewport Compositor
                                                      │
                                              Chromium Allocator / JIT Cache Plateau
```

### Hierarchy Breakdown:
* **Level 1: V8 JavaScript Heap** (`JSHeapUsedSize` / `JSHeapTotalSize`) — Is heap growing monotonically (e.g., $30\text{MB} \rightarrow 60\text{MB} \rightarrow 120\text{MB} \rightarrow 250\text{MB}$)?
* **Level 2: DOM Node Lifecycle** (`Nodes` / `Documents`) — Are detached DOM nodes accumulating across mount/unmount cycles?
* **Level 3: Event Subscriptions & Listeners** (`JSEventListeners`) — Are listeners accumulating across component/route transitions?
* **Level 4: GPU Process Working Set** (`GPU WS`) — Does viewport size, blur shaders, or window resizing explain GPU usage?
* **Level 5: Main Process Native Memory** (`Node process.memoryUsage()` / `Main WS`) — Does database/image engine memory settle after cold launch?
* **Attribution Output: Renderer Process Working Set** (`Renderer WS` / `PrivateMemorySize64`) — Does it reach a bounded plateau or experience runaway growth?

---

## 2. Fundamental Attribution Rules

### A. Renderer Working Set $\neq$ JavaScript Heap
* **Rule**: In an Electron/Chromium application, the V8 JavaScript Heap accounts for only a fraction of the Renderer process's total OS Working Set.
* **Why**: Chromium's Renderer process includes:
  - V8 JIT code cache and heap metadata
  - Blink DOM tree and style calculation structures
  - Chromium PartitionAlloc memory blocks
  - Web font glyph caches and layout object tables
  - Image decoding buffers and Skia canvas memory
* **Directive**: If V8 JS Heap is verified lean (e.g., $\le 35\text{ MB}$) while Renderer WS is $\sim 450\text{–}490\text{ MB}$, **DO NOT blindly modify React state, TanStack queries, or component hooks**. Attribute the memory to Chromium runtime/allocator warming before proposing application changes.

### B. Avoid Measurement Illusions
* **Rule**: Do not apply superficial mechanisms that manipulate Task Manager figures without reducing true committed memory.
  - **`global.gc()`**: If V8 heap is already small ($\sim 30\text{ MB}$), forced GC does not explain or solve native renderer memory.
  - **Windows Working Set Trimming (`SetProcessWorkingSetSize`)**: Calling Win32 working set trimming forces pages into the paging file/standby list. While the Task Manager number drops temporarily, pages will fault back in upon access, creating a false illusion of optimization.

---

## 3. Multi-Cycle Lifecycle Benchmark Protocol

To prove whether a system has a genuine memory leak or is simply warming up Chromium allocators, **single-pass benchmarks are insufficient**. Always execute repeated lifecycle transitions:

### Protocol Steps:
1. **Cold Launch Baseline ($T_0$)**: Measure initial launch memory before user interactions.
2. **Active Workload Pass**: Execute active playback, view changes, and queue traversals.
3. **Repeated Mode Transitions ($N \ge 3$ Cycles)**:
   $$\text{Main View} \longrightarrow \text{Mini/Compact Mode} \longrightarrow \text{Main View} \quad (\times 3\text{ cycles})$$
4. **Post-Workload Rest Phase**: Measure settled retention after a 30–60 second rest period.

### Analyzing Results:
* **Runaway Leak Pattern (Defect)**:
  $$\text{Heap: } 30\text{ MB} \longrightarrow 60\text{ MB} \longrightarrow 120\text{ MB} \longrightarrow 240\text{ MB} \quad \text{or} \quad \text{WS: } 350\text{ MB} \longrightarrow 550\text{ MB} \longrightarrow 750\text{ MB} \longrightarrow 950\text{ MB}$$
* **Warm Plateau Pattern (Healthy)**:
  $$\text{Heap: } 30\text{ MB} \longrightarrow 31\text{ MB} \longrightarrow 30\text{ MB} \longrightarrow 32\text{ MB} \quad \text{and} \quad \text{WS: } 340\text{ MB} \longrightarrow 460\text{ MB} \longrightarrow 465\text{ MB} \longrightarrow 475\text{ MB}$$

---

## 4. Telemetry Collection Invariants

1. **Process Role Correlation**: Correlate OS PIDs using command-line inspection (`Win32_Process.CommandLine`) into distinct roles: `Main`, `Renderer`, `GPU`, `Utility`.
2. **CDP Performance Domain**: Capture exact Chrome DevTools Protocol metrics:
   - `JSHeapUsedSize` / `JSHeapTotalSize`
   - `Nodes` (DOM Node count)
   - `Documents`
   - `LayoutObjects`
   - `JSEventListeners`
3. **Reporting Standards**:
   - Explicitly separate **Observed Facts** from **Inferences** and **Assumptions**.
   - Do not claim causal percentage improvements from isolated runs without repeated A/B validation.

---

## 5. Memory Attribution: Three Different Meanings of "Small"

When evaluating Main Player vs MiniPlayer vs Compact MiniPlayer, **NEVER equate visual/window size with process memory size**.

Distinguish these three layers:

### A. Visual Footprint
What the user sees and what Chromium must actively render.
- **Examples**: Viewport dimensions, visible DOM, active CSS animations, canvas/WebGL surfaces, blur/backdrop effects, compositor surfaces.
- **Indicator**: Strongly reflected by GPU memory and rendering frame times.

### B. Application Resource Footprint
What Nora is actively keeping alive in memory.
- **Examples**: Mounted React components, DOM nodes, event listeners, store subscriptions, observers, intervals/timers, query cache entries, audio/lyrics buffers, IPC listeners.
- **Indicator**: The primary layer to investigate when asking: *"Does MiniPlayer actually unmount the Main Player?"*

### C. Process Working Set
What the OS currently reports as resident memory for the process.
- **Includes**: V8/JS memory, Blink structures, PartitionAlloc arenas, JIT code pages, decoded web resources, font/glyph caches, Skia graphics caches, and previously allocated but reusable memory pages.

> [!IMPORTANT]
> A Compact MiniPlayer can have a large Renderer Working Set while simultaneously having a small active UI/resource footprint. A large Renderer WS alone is **NOT** evidence that Compact MiniPlayer is retaining the full Main Player.

---

## 6. Mode-Transition Attribution Protocol

When comparing:
$$\text{Main Player} \longrightarrow \text{Standard MiniPlayer} \longrightarrow \text{Compact MiniPlayer}$$

Do not judge optimization using Working Set alone. For every mode, capture at minimum:
* `Renderer WS` & `GPU WS` & `Main WS`
* `JS Heap Used` & `JS Heap Total`
* `DOM Nodes` & `Documents` & `Layout Objects`
* `JS Event Listeners`

Additionally investigate application lifecycle state where possible:
- Mounted React views/components
- Active store subscriptions and IPC listeners
- Active timers and mutation observers
- Query cache entries
- Image and canvas resources

### Expected Interpretation
If:
$$\text{Renderer WS: } 480\text{MB} \rightarrow 460\text{MB} \quad|\quad \text{JS Heap: } 32\text{MB} \rightarrow 29\text{MB} \quad|\quad \text{DOM Nodes: } 2100 \rightarrow 1500 \quad|\quad \text{GPU WS: } 260\text{MB} \rightarrow 175\text{MB}$$
The correct conclusion is **NOT**: *"MiniPlayer still uses 460 MB, therefore it isn't lightweight."*
The correct conclusion is: *"The active UI/resource footprint decreases, GPU usage decreases substantially, and the Renderer Working Set remains elevated. Further attribution is required before determining whether retained Renderer memory belongs to Nora or Chromium."*

---

## 7. Compact / MiniPlayer Specific Investigation

When a smaller player mode is expected to have a significantly smaller footprint, investigate whether the Main Player is actually unmounted:

### 10 Questions to Answer:
1. Are Main Player components still mounted in the React tree?
2. Are their DOM nodes still present in the document?
3. Are their event listeners still registered?
4. Are their store subscriptions still active?
5. Are their timers or intersection observers still running?
6. Are route-specific queries still active?
7. Are hidden components merely CSS-hidden (`display: none` / `opacity: 0`) instead of unmounted?
8. Are portals or context menu overlays still mounted?
9. Are canvas or WebGL resources still active?
10. Does the renderer continue performing work associated with the Main Player?

### Evidence Signatures:
* **Strong Evidence of Proper Lifecycle Cleanup**:
  $$\text{Main} \rightarrow \text{Mini} \implies \text{DOM Nodes } \downarrow, \text{ Listeners } \downarrow, \text{ Active Effects } \downarrow, \text{ GPU Workload } \downarrow$$
* **Evidence Requiring Further Investigation**:
  $$\text{Main} \rightarrow \text{Mini} \implies \text{DOM Nodes } \approx \text{same}, \text{ Listeners } \approx \text{same}, \text{ Subscriptions } \approx \text{same}, \text{ GPU } \downarrow, \text{ Renderer WS } \approx \text{same}$$
  *(This may indicate the window resized while substantial application UI remained mounted. Do NOT conclude a leak without repeated-cycle evidence).*

---

## 8. Chromium Retention vs Application Retention

A memory allocation remaining in Renderer Working Set does not prove that the corresponding application object is still reachable.

```text
Application Retention
    ↓
Object / component / resource is still reachable or active in JS/DOM
    ↓
Potential application defect

Chromium Allocation Retention
    ↓
Application object / resource has been garbage collected / unmounted
    ↓
Chromium allocator (PartitionAlloc / Skia / JIT cache) retains pages for reuse
    ↓
Normal runtime behavior
```

Whenever possible, prove reachability and lifecycle independently from OS Working Set.

---

## 9. Required Investigation Sequence

For memory investigations, follow this exact sequence:

1. **Phase 1 — Establish Baseline**: Capture Cold launch, Idle, and Active playback.
2. **Phase 2 — Exercise Workload**: Perform the specific workload under test (playback, lyrics, queue skips, route changes).
3. **Phase 3 — Lifecycle Transition**: Capture $\text{Main} \rightarrow \text{Standard Mini} \rightarrow \text{Compact Mini} \rightarrow \text{Main}$ (repeat at least 3 times).
4. **Phase 4 — Attribution**: Compare JS Heap, DOM Nodes, Listeners, Layout Objects, GPU, Renderer WS, and Main WS.
5. **Phase 5 — Rest**: Allow application to settle for 30–60 seconds. Do not interpret transient post-transition allocations as leaks.
6. **Phase 6 — Verdict**: Classify findings using the standard verdict scale.

---

## 10. Benchmark Quality Rules

* **Single-Run Results**: Useful for discovering suspicious behavior, identifying candidates, and establishing rough baselines. **Insufficient for proving a memory leak or claiming percentage improvements.**
* **Multi-Cycle Results**: Required for lifecycle leak detection, retention analysis, and mode-transition stability.
* **A/B Comparisons**: Required before claiming *"Change X reduced memory by Y%"*. Run $\text{Control} \times N\text{ cycles}$ vs $\text{Modified} \times N\text{ cycles}$ under equivalent workload and environment. Report median, min/max, cycle-to-cycle trend, and settled values.

---

## 11. Evidence Classification

Every investigation report **MUST** separate:
* **Observed Facts**: Direct measurements from CDP, OS process telemetry, or application instrumentation.
* **Inferences**: Reasonable engineering interpretations of the measurements (e.g. *"GPU footprint decreases in Compact mode"*).
* **Assumptions**: Unverified hypotheses (e.g. *"Remaining Renderer WS is probably retained Chromium allocator memory"*).
* **Unproven Claims**: Hypotheses that require additional empirical testing.

> **Never present an inference or assumption as an observed fact.**

---

## 12. Anti-Optimization Rules

Do not recommend changes solely because they reduce Task Manager numbers. Avoid these superficial practices:
* Calling `global.gc()` in production code.
* Calling Win32 `SetProcessWorkingSetSize()`.
* Arbitrary cache clearing without retention evidence.
* Forced renderer reloads to artificially deflate memory.
* Destroy/recreate component thrashing.

### Prefer True Architectural Optimizations:
- Unmount unused UI components.
- Remove unnecessary store subscriptions.
- Dispose observers and intervals.
- Release GPU and canvas resources.
- Evict genuinely unnecessary application caches.
- Eliminate duplicate IPC listeners.

---

## 13. Final Reporting Template

Every performance investigation must conclude with:

```markdown
### Observed
- ...
- ...

### Inferred
- ...
- ...

### Not Proven / Assumptions
- ...
- ...

### Verdict
- 🟢 Healthy / bounded
- 🟡 Retention requires investigation
- 🟠 Likely application-level retention
- 🔴 Confirmed memory leak
- ⚪ Inconclusive

### Recommended Next Test
[Specify the smallest experiment that can distinguish the remaining hypotheses. Do not modify production code when instrumentation can answer the question first.]
```
