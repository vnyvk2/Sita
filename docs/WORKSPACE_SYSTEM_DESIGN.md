# Nora Workspace System — Design Doc

## 1. Goals, Non-Goals, and Locked Decisions

### Goals
1. Any panel can live on the left, right, bottom, center — user decides.
2. Layouts are serializable documents: persist, switch, duplicate, export, import.
3. Zero regression: default workspace looks *exactly* like Nora today.
4. Customizability never becomes the next source of rendering/scroll regressions.

### Non-goals (v1)
- Floating / detachable OS windows.
- Arbitrary pixel-level positioning (free-form dragging everywhere).
- Dragging individual track items or data rows between panels.
- Runtime / third-party plugin panel loader.
- Cloud syncing or networked workspace state.

### Locked Decisions

| # | Decision | Rationale |
|---|---|---|
| **D1** | Layout = serializable tree (`LayoutNode`), interpreted by a renderer. No layout JSX anywhere except the engine. | Makes layout purely data-driven, versionable, and portable. |
| **D2** | Two panel kinds: **views** (bound to routes) and **widgets** (store-driven, dockable anywhere). | Clarifies dependency rules; prevents routing chaos. |
| **D3** | Exactly **one** `router-view` panel per workspace (renders `<Outlet/>`). Enforced by validation. | Preserves single source of truth for `@tanstack/react-router`. |
| **D4** | TitleBar + PlayerBar stay **outside** the tree in v1 (position toggle only). Promoting chrome into the tree is a later, safe extension. | Keeps critical playback controls and OS window controls stable. |
| **D5** | Resize **bypasses React during drag** (DOM-direct), commits once on pointer-up. | Guarantees 60fps buttery smooth split resizing with 0 React renders. |
| **D6** | Panel UI state lives in a per-instance `local` bag, not component state. Moving a panel = moving its state with it. | Moving a panel preserves scroll offset, filter selections, and active sub-tabs. |
| **D7** | Split sizes are normalized **weights**, not pixels — resilient across window sizes. | Adapts seamlessly when Nora window is resized or maximized. |
| **D8** | Built-in presets are read-only data; users duplicate to edit. | Prevents users from accidentally bricking default configurations. |
| **D9** | Every imported layout is sanitized; unknown panels degrade to an `empty` placeholder, never crash. | Fault-tolerant schema migration and import isolation. |
| **D10** | All layout ops are pure functions with checked invariants and unit tests. | Deterministic layout state transitions, zero-cost undo/redo potential. |

---

## 2. Architecture: Three Layers, Strictly Separated

```text
App state (unchanged)          Workspace state (new)           Panels (refactored)
─────────────────────          ─────────────────────           ───────────────────
playback, queue,               layout tree, panel              NavigationPanel
library, settings,             instances, sizes,               LyricsPanel
search, DB                     workspaces, presets             QueuePanel
     │                              │                          RouterViewPanel
     │                              │                               │
     └──────────────────────────────┴───────────────────────────────┘
        Panels subscribe to app state via narrow selectors.
        Panels know NOTHING about where they are docked.
        The engine knows NOTHING about what panels contain.
```

- **Two TanStack stores:**
  - `workspaceStore`: Persisted (`localStorage` key `nora.workspaces.v1` with debounced sync). Holds all workspaces, active workspace ID, panel instances, and layout trees.
  - `dndStore`: Transient, in-memory only. Holds drag payloads, active hover targets, drop indicators, and `maximizedPanelId`.

---

## 3. Data Model

```ts
// src/renderer/workspace/types.ts

export type PanelKind = 'view' | 'widget';

export type PanelType =
  | 'navigation'     // widget, singleton
  | 'router-view'    // view,   singleton, REQUIRED
  | 'queue'          // widget
  | 'lyrics'         // widget (keepMounted: true)
  | 'now-playing'    // widget
  | 'track-info'     // widget
  | 'visualizer'     // widget, duplicate: true
  | 'empty';         // placeholder for imports/broken refs

export type PanelInstanceId = string;   // e.g. nanoid or prefixed id ("p_lyrics")

export interface PanelInstance {
  id: PanelInstanceId;
  type: PanelType;
  /** The ONLY place a panel keeps ephemeral UI state (scroll, filters, zoom) */
  local: Record<string, unknown>;
}

export interface PanelRefNode {
  kind: 'panel';
  panel: PanelInstanceId;
}

export interface TabGroupNode {
  kind: 'tabs';
  id: string;
  tabs: PanelInstanceId[];       // length >= 1
  active: PanelInstanceId;       // must exist in tabs
}

export interface SplitNode {
  kind: 'split';
  id: string;
  axis: 'x' | 'y';
  children: LayoutNode[];        // length 2..4
  weights: number[];             // normalized, sum ~= 1.0
  collapsed?: number | null;     // index of a temporarily collapsed child
}

export type LayoutNode = PanelRefNode | TabGroupNode | SplitNode;

export interface WorkspaceFrameConfig {
  playerBar: 'top' | 'bottom';
  playerBarCompact: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  schemaVersion: number;         // migration chain version
  root: LayoutNode;
  panels: Record<PanelInstanceId, PanelInstance>;
  frame: WorkspaceFrameConfig;
}

export interface WorkspaceState {
  active: string;
  workspaces: Record<string, Workspace>;
}
```

### JSON-as-Document Example (MusicBee Preset)
```jsonc
{
  "id": "preset-musicbee",
  "name": "MusicBee",
  "schemaVersion": 1,
  "frame": {
    "playerBar": "bottom",
    "playerBarCompact": false
  },
  "root": {
    "kind": "split",
    "axis": "x",
    "id": "s_root",
    "weights": [0.15, 0.60, 0.25],
    "children": [
      { "kind": "panel", "panel": "p_nav" },
      { "kind": "panel", "panel": "p_main" },
      {
        "kind": "tabs",
        "id": "t_right",
        "tabs": ["p_lyrics", "p_queue"],
        "active": "p_lyrics"
      }
    ]
  },
  "panels": {
    "p_nav":    { "id": "p_nav",    "type": "navigation",  "local": {} },
    "p_main":   { "id": "p_main",   "type": "router-view", "local": {} },
    "p_lyrics": { "id": "p_lyrics", "type": "lyrics",      "local": {} },
    "p_queue":  { "id": "p_queue",  "type": "queue",       "local": {} }
  }
}
```

---

## 4. Panel Registry

```ts
// src/renderer/workspace/registry.ts

import type { ComponentType, LazyExoticComponent } from 'react';
import type { PanelInstance, PanelKind, PanelType } from './types';

export interface PanelApi {
  instanceId: string;
  type: PanelType;
  setLocal: <T>(key: string, value: T | ((prev: T) => T)) => void;
  getLocal: <T>(key: string, defaultValue: T) => T;
  close: () => void;
  maximize: () => void;
}

export interface PanelProps {
  instance: PanelInstance;
  api: PanelApi;
}

export interface PanelDefinition {
  type: PanelType;
  title: string;
  icon: string; // Material Symbol identifier
  component: LazyExoticComponent<ComponentType<PanelProps>>;
  kind: PanelKind;
  singleton?: boolean;      // at most 1 instance allowed in workspace
  duplicate?: boolean;      // can appear multiple times
  keepMounted?: boolean;    // stays mounted (display:none) when hidden in tabs
  minSize?: { w?: number; h?: number };
  defaultWeight?: number;   // default split weight share when inserted
}
```

### Initial Registry Catalog

| Type | Kind | Singleton | KeepMounted | Source & Behavior |
|---|---|---|---|---|
| `navigation` | widget | yes | false | Extracted from `Sidebar.tsx` (route links, library filters) |
| `router-view` | view | yes | false | Renders TanStack Router `<Outlet/>`, cannot be closed or duplicated |
| `queue` | widget | false | false | Extracted from `QueueTabs.tsx` (Up Next, Play history) |
| `lyrics` | widget | false | **yes** | Extracted from `LyricsDrawer.tsx` (synced lyrics animation engine survives tab switches) |
| `now-playing` | widget | false | false | Rich album art, artist details, audio format tags |
| `track-info` | widget | false | false | Detailed audio metadata, bitrate, codec, tags |
| `visualizer` | widget | false | false | `duplicate: true`, audio frequency spectrum / waveform |
| `empty` | widget | false | false | Fallback placeholder for missing or unresolvable panel types |

---

## 5. Router Integration

1. **One Router View Node:**
   The workspace tree contains exactly **one** `router-view` panel, which renders `@tanstack/react-router`'s `<Outlet/>`. Since `<Outlet/>` can be rendered anywhere within the parent route's component tree, nesting depth in `SplitNode` or `TabGroupNode` does not alter router behavior.
2. **Navigational Invariant:**
   View navigation remains 100% URL-driven. Clicking a route link in `navigation` triggers `router.navigate()`. The single `<Outlet/>` updates seamlessly. Deep links, back/forward history, and query parameters remain intact.
3. **Auto-focus Activation Rule:**
   If the user triggers a navigation action (e.g., clicks "Albums" or uses a global shortcut) while `router-view` is an inactive tab in a `TabGroupNode`, the workspace engine automatically activates that tab and brings `router-view` to the front.
4. **Overlay Chrome Isolation:**
   `NotificationPanel`, `ContextMenu`, and `PromptMenu` stay in the global `WorkspaceFrame` layer as chrome overlays; they do not become panels in the layout tree.
5. **Global Action Bridge (`toggleLyricsDrawer`):**
   When `toggleLyricsDrawer` is fired via shortcut:
   - If a `lyrics` panel exists in a `TabGroupNode`, switch that tab to active.
   - If a `lyrics` panel exists in a collapsed `SplitNode`, expand it.
   - If no `lyrics` panel exists in the active workspace, append/dock a `lyrics` panel into the right-most split edge.

---

## 6. Rendering Engine & Performance Budget

```text
MainPlayerRoute (root shell)
 └─ WorkspaceFrame            TitleBar, PlayerBar position (D4), overlays
     └─ WorkspaceController   Subscribes workspaceStore, provides DndContext
         └─ NodeView(root)
             ├─ SplitView     CSS flex + resizer divider (DOM-direct resize)
             │    ├─ NodeView ─ NodeView
             ├─ TabGroup      tablist header + active child panel
             │    └─ PanelHost
             └─ PanelHost     PanelFrame + ErrorBoundary + Suspense
                  └─ Registry component (lazy loaded)
```

### Performance & Resize Mechanics (D5)
- **DOM-Direct Resize:**
  - Dividers capture pointer events with `dividerEl.setPointerCapture(e.pointerId)`.
  - Workspace container receives `data-resizing="true"`, applying `pointer-events: none` and `user-select: none` to all pane contents. This completely prevents canvas / iframe event stealing and eliminating CSS blur repaint lag.
  - During `pointermove`, flex weights (`flexGrow: ${px}`) are applied **directly to DOM element styles**.
  - **Zero React renders occur during active dragging.**
  - On `pointerup`, pixel values are normalized into fractional weights (summing to 1.0) and dispatched once via `{ t: 'split.weights' }`.
- **Render Isolation via Structural Sharing:**
  - Immutable tree updates (`updateNode(root, path, fn)`) update only the ancestors of the changed node.
  - Unaffected siblings and branch nodes preserve referential identity. All `NodeView` components are wrapped in `React.memo`, skipping reconciliation.
- **Independent Narrow Store Selectors:**
  - Panels subscribe strictly to granular slices (e.g. `useStore(store, s => s.playback.currentSong.songId)`).
  - 60fps audio visualizers or time tickers never trigger re-renders in adjacent list or router views.

---

## 7. The Panel State Contract (`local` Bag)

- **No Layout Awareness:** Panels do not inspect DOM parents, viewport widths, or sibling presence. Size responsiveness is driven by `PanelApi` (via `ResizeObserver`).
- **UI State Persistence via `usePanelLocal`:**
  ```ts
  function usePanelLocal<T>(key: string, initial: T): [T, (val: T | ((prev: T) => T)) => void]
  ```
  All ephemeral state (scroll offsets, search filters, zoom level) is stored in `instance.local`. When a panel is moved (re-parented), its `local` dictionary is preserved in the flat `workspace.panels` map.
- Size safety guard: `instance.local` warns in development if serialized payload exceeds 16KB.

---

## 8. Layout Operations & Invariants

All layout transformations are pure, deterministic functions:

```ts
// src/renderer/workspace/ops.ts

export type LayoutOp =
  | { t: 'panel.insert'; type: PanelType; at: DropTarget }
  | { t: 'panel.move'; panelId: PanelInstanceId; at: DropTarget }
  | { t: 'panel.close'; panelId: PanelInstanceId }
  | { t: 'split.weights'; splitId: string; weights: number[] }
  | { t: 'split.collapse'; splitId: string; childIndex: number | null }
  | { t: 'tabs.activate'; tabsId: string; panelId: PanelInstanceId }
  | { t: 'tabs.reorder'; tabsId: string; order: PanelInstanceId[] }
  | { t: 'tabs.extract'; panelId: PanelInstanceId; axis: 'x' | 'y' }
  | { t: 'ws.create'; name: string; presetId?: string }
  | { t: 'ws.switch'; id: string }
  | { t: 'ws.duplicate'; id: string; newName: string }
  | { t: 'ws.rename'; id: string; name: string }
  | { t: 'ws.delete'; id: string }
  | { t: 'ws.reset'; id: string };

export type DropTarget =
  | { k: 'edge'; splitId: string; index: number }
  | { k: 'split-into'; targetPanelId: PanelInstanceId; axis: 'x' | 'y'; before?: boolean }
  | { k: 'tab-into'; tabsId: string; index?: number };

export function applyLayoutOp(ws: Workspace, op: LayoutOp): Workspace;
export function assertWorkspaceInvariants(ws: Workspace): void;
```

### System Invariants (Asserted in Dev & on Import)
1. **Single Router View:** Exactly one `router-view` panel instance exists in the tree. It cannot be deleted or duplicated.
2. **Orphan Prevention:** Every `panelId` in `workspace.panels` is referenced exactly once in `workspace.root`. Dangling panel instances are automatically pruned.
3. **Split Constraints:** Split children count $\in [2, 4]$. Split nesting depth $\le 3$. Weights are positive and sum to $1.0 \pm 0.001$.
4. **TabGroup Invariants:** Tab count $\ge 1$. `active` panel ID is always an element of `tabs`.
5. **Singleton Invariants:** `singleton: true` panel types appear at most once across the entire workspace.

---

## 9. Persistence & Document Pipeline

- **Primary Store:** `localStorage` key `nora.workspaces.v1`.
- **Debounced Flush:** 300ms debounce ensures rapid drag-and-drop or typing doesn't thrash storage.
- **Export / Import:**
  - Export generates standard JSON containing `schemaVersion`, `exportedAt`, `name`, `root`, `panels`, and `frame`.
  - Import pipeline: `JSON Parse` $\to$ `Schema Migration` $\to$ `Sanitize & Normalize` $\to$ `Invariant Assertion` $\to$ `Re-key Workspace ID`.
  - Unknown panel types degrade to `empty` with warning logs rather than throwing.

---

## 10. Interaction Design & Accessibility

- **Pointer DnD (Custom Pointer Events):**
  - Smooth dragging from tab strips or panel headers.
  - Drop targets with live edge/tab overlays.
  - Invalid drop targets are rejected prior to rendering highlights.
- **Keyboard-First Layout Operations:**
  - `F6`: Cycle focus across visible panels.
  - `Alt + Left / Right`: Previous / next tab in focused tab group.
  - `Ctrl + Shift + Arrows`: Move focused panel.
  - `Ctrl + Alt + M`: Maximize / restore focused panel (`maximizedPanelId`).
  - `Ctrl + W`: Close focused panel (disabled for `router-view`).
- **Layout Editor Modal:**
  - Provides a dedicated visual modal with an indented tree of nodes and action buttons (Split, Move, Delete, Resize).
  - Ensures 100% accessible layout customization without requiring mouse drag-and-drop.

---

## 11. Performance Budget

| Interaction | Budget | Architectural Mechanism |
|---|---|---|
| Split Resize Drag | 60fps, **0 React Renders** | DOM-direct flex-grow mutation with pointer capture |
| Tab Switch | < 50ms | Single component mount; inactive tabs unmount unless `keepMounted` |
| Panel Move | Minimal subtree update | Referential immutability via `updateNode` + `React.memo` |
| Workspace Switch | < 150ms first paint | Code-split lazy panels + Suspense skeletons |
| Persistence IO | < 5ms write, < 100KB | Synchronous `localStorage` with 300ms debounce channel |
| Cross-panel Isolation | 60fps visualizer $\implies$ 0 re-renders | Strictly narrow selector subscriptions |

---

## 12. Repository Structure

```text
src/renderer/src/workspace/
  ├── types.ts                    // Complete type definitions and schemas
  ├── registry.ts                 // Panel catalog, definitions, and metadata
  ├── store.ts                    // workspaceStore, dndStore, hooks, actions
  ├── ops.ts                      // Pure layout reducers + assertWorkspaceInvariants
  ├── persistence.ts              // localStorage adapter, migrations, sanitization, export/import
  ├── engine/
  │    ├── NodeView.tsx           // Recursive node dispatcher
  │    ├── SplitView.tsx          // Flexbox split layout + DOM-direct resize divider
  │    ├── TabGroup.tsx           // Accessible tablist + panel switcher
  │    ├── PanelHost.tsx          // ErrorBoundary + Suspense wrapper
  │    ├── PanelFrame.tsx         // Panel header, title, icon, action menu, drag handle
  │    └── PanelSkeleton.tsx      // Loading placeholder
  ├── dnd/
  │    ├── DndContext.tsx         // Pointer drag tracking & transient state
  │    └── DropOverlay.tsx        // Edge and center dropzone indicators
  ├── editor/
  │    └── LayoutEditor.tsx       // Accessible layout modal editor
  ├── hooks/
  │    ├── usePanelLocal.ts       // Local UI state hook
  │    └── usePanelFocus.ts       // Focus management and keyboard navigation
  ├── presets/
  │    ├── default.ts             // Nora classic layout (Navigation left, RouterView center)
  │    ├── musicbee.ts            // MusicBee 3-column layout
  │    ├── minimal.ts             // Max content, auto-hiding navigation
  │    └── focus.ts               // Big art, now playing, lyrics
  └── panels/
       ├── NavigationPanel/       // Wrapper around Sidebar navigation
       ├── RouterViewPanel/       // Outlet container
       ├── QueuePanel/            // Queue & History
       ├── LyricsPanel/           // Synced Lyrics engine (keepMounted: true)
       ├── NowPlayingPanel/       // Track art & playback info
       ├── TrackInfoPanel/        // Audio specs & technical tags
       └── VisualizerPanel/       // Audio waveform & visualizer
```

---

## 13. Phased Rollout Plan

- **Phase 0: Foundation (Current Step)**
  - Implement `types.ts`, `registry.ts`, `ops.ts`, `assertWorkspaceInvariants`.
  - Add comprehensive unit tests in `src/renderer/src/workspace/__tests__/ops.test.ts`.
  - Verify all invariants and randomized operation sequences.
- **Phase 1: Core Engine & Parity**
  - Implement `NodeView`, `SplitView`, `TabGroup`, `PanelHost`, DOM-direct resize.
  - Wrap `Sidebar.tsx` in `NavigationPanel` and `<Outlet/>` in `RouterViewPanel`.
  - Mount behind feature flag `settings.experimentalWorkspace` with `default` preset.
  - Verify zero visual or behavioral regressions against standard Nora layout.
- **Phase 2: Panelization & MusicBee Preset**
  - Modularize `LyricsPanel`, `QueuePanel`, `NowPlayingPanel`, `VisualizerPanel`.
  - Enable `musicbee` preset switching.
- **Phase 3: Drag-and-Drop & Layout Editor**
  - Add pointer DnD, drop overlays, and Layout Editor modal.
- **Phase 4: Multi-Workspace & Document Portability**
  - Workspace management UI (create, duplicate, rename, reset).
  - JSON Export / Import with sanitization.
