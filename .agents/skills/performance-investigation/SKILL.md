---
name: performance-investigation
description: Rigorous methodology for investigating memory leaks, UI render cascades, lifecycle transitions, and process-level performance across Electron and Chromium architectures.
---

# Performance Investigation Skill — Nora

## 0. Core Operating Principle

> **Never confuse a "Large Working Set" with a "Memory Leak". A memory leak requires empirical evidence of persistent, monotonic, or unbounded growth across repeated lifecycle transitions. Distinguish warm runtime allocation plateaus from application resource leaks, and avoid measurement illusions.**

---

## 1. The Investigation Hierarchy

When auditing memory and performance, investigate through this strict hierarchy from application-level state down to process-level native memory:

```text
Performance Investigation Hierarchy
        │
        ├── Level 1: V8 JavaScript Heap
        │      └── Metric: JSHeapUsedSize / JSHeapTotalSize
        │      └── Test: Does heap grow monotonically (e.g., 30MB → 60MB → 120MB → 250MB)?
        │
        ├── Level 2: DOM Node Lifecycle
        │      └── Metric: CDP Nodes & Documents
        │      └── Test: Do detached nodes accumulate across repeated mount/unmount cycles?
        │
        ├── Level 3: Event Subscriptions & Listeners
        │      └── Metric: CDP JSEventListeners
        │      └── Test: Do event listeners accumulate across component/route lifecycles?
        │
        ├── Level 4: Renderer Process Working Set
        │      └── Metric: OS WorkingSet64 & PrivateMemorySize64
        │      └── Test: Does Renderer WS reach a bounded plateau or experience runaway growth?
        │
        ├── Level 5: GPU Process Working Set
        │      └── Metric: GPU Process WorkingSet64
        │      └── Test: Does viewport size, blur shaders, or window resizing explain GPU usage?
        │
        └── Level 6: Main Process Native Memory
               └── Metric: Node process.memoryUsage() / OS WorkingSet64
               └── Test: Does database/image engine memory settle after cold launch?
```

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
