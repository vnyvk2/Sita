# Future Playlist Cover System Roadmap & Complete Architectural Structure Map

---

# 🎨 UI Layout Evolution Strategy & Modal Sizing Plan

## Problem Diagnosis
The global `PromptMenu.tsx` component forces a default modal window width of **800px** (`min-w-[800px]`), while `PlaylistCoverSettingsPrompt.tsx` hardcodes a **480px** inner container. This creates ~320px of empty, unstyled background on the right side of the modal.

---

## Strategic 2-Step Layout Plan

### Step 1: Immediate Phase 3 Stabilization (Single-Column Fit)
- **Temporary Adjustment**: Pass custom width constraints to `changePromptMenuData` in `PlaylistInfoAndImgContainer.tsx` and `Playlist.tsx` (`max-w-[540px] min-w-0 w-auto`).
- **Goal**: Instantly eliminate the dead right-hand space in Phase 3 without rushing a half-baked two-column refactor. The modal shrinks to ~540px to fit the current vertical layout cleanly.

```
Phase 3 Modal (540px Single Column)
┌──────────────────────────────────────┐
│       Customize Playlist Cover       │
├──────────────────────────────────────┤
│            Live Preview              │
├──────────────────────────────────────┤
│        Selected Cover Slots          │
├──────────────────────────────────────┤
│      Mode / Layout / Count           │
├──────────────────────────────────────┤
│         Numbered Song Picker         │
└──────────────────────────────────────┘
```

---

### Step 2: Phase 4 Desktop Workspace Redesign (Two-Column Layout)
- **Long-Term Evolution**: In Phase 4, expand the modal window back to **~900px** (`min-w-[900px]`) and intentionally refactor `PlaylistCoverSettingsPrompt.tsx` into a modern 2-column desktop cover design workstation.
- **Goal**: Eliminate vertical scrolling and maximize screen real estate for rich visual editing.

```
Phase 4 Modal (~900px Desktop Workspace)
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Customize Playlist Cover                             │
├─────────────────────────────────────┬───────────────────────────────────────┤
│                                     │                                       │
│          LEFT COLUMN (~360px)       │         RIGHT COLUMN (~540px)         │
│                                     │                                       │
│    ┌───────────────────────────┐    │    ┌─────────────────────────────┐    │
│    │                           │    │    │ Cover Mode (Auto / Collage) │    │
│    │     LARGE LIVE PREVIEW    │    │    └─────────────────────────────┘    │
│    │    (Interactive Slots)    │    │    ┌─────────────────────────────┐    │
│    │                           │    │    │ Layout Cards (Grid/Tri/...) │    │
│    └───────────────────────────┘    │    └─────────────────────────────┘    │
│                                     │    ┌─────────────────────────────┐    │
│    ┌───────────────────────────┐    │    │ Sub-Styles (Diag/Pin/...)   │    │
│    │  Selected Slots Reorder   │    │    └─────────────────────────────┘    │
│    │  (Drag & Drop Chips)      │    │    ┌─────────────────────────────┐    │
│    └───────────────────────────┘    │    │ Cover Images Count (1..5)   │    │
│                                     │    └─────────────────────────────┘    │
│                                     │    ┌─────────────────────────────┐    │
│                                     │    │  Scrollable Song Picker     │    │
│                                     │    └─────────────────────────────┘    │
│                                     │                                       │
└─────────────────────────────────────┴───────────────────────────────────────┘
```

---

# 🗺️ Complete Playlist Cover Architecture Map

This section maps the exact architecture, data pipeline, component hierarchy, and file structure built during Phases 3A–3D. Reference this map when implementing Phase 4+.

---

## 1. High-Level Data Flow Map

```
                  Playlist Settings (Storage / React State)
                                     │
                                     ▼
                   resolveEffectiveCoverSongs()
                   (Single Source of Truth Helper)
                                     │
                     ┌───────────────┴───────────────┐
                     ▼                               ▼
           resolvePlaylistCover()       PlaylistCoverSettingsPrompt
           (Pure Cover Resolver)             (Interactive Editor)
                     │                               │
                     │                 ┌─────────────┼─────────────┐
                     │                 ▼             ▼             ▼
                     │            CoverLive     SelectedSongs    Numbered
                     │             Preview       ReorderBar     SongPicker
                     │                 │             │             │
                     └─────────────────┼─────────────┴─────────────┘
                                       │
                                       ▼
                             MultipleArtworksCover
                         (Pluggable Renderer Registry)
                                       │
            ┌──────────────────┬───────┴──────────┬──────────────────┐
            ▼                  ▼                  ▼                  ▼
      GridRenderer     TriangleRenderer      FanRenderer      DiamondRenderer
            │                  │                  │                  │
            └──────────────────┴───────┬──────────┴──────────────────┘
                                       │
                                       ▼
                                PresetRenderer<S>
                         (Lookup from Geometry Presets)
                                       │
                                       ▼
                               ClipPathRenderer
                         (Clips array of CoverImageTiles)
                                       │
                                       ▼
                                CoverImageTile
                         (Pure Image Tile Presenter)
```

---

## 2. Pluggable Renderers & Geometry Blueprint

### Renderers (`src/renderer/src/components/PlaylistsPage/renderers/`)
- **`CoverImageTile.tsx`**: Renders a single artwork tile (positioning-agnostic).
- **`ClipPathRenderer.tsx`**: Shared primitive iterating over `artworks` and applying array of CSS `clipPath` polygons.
- **`PresetRenderer.tsx`**: Generic preset lookup primitive. Handles 0/1 artwork fallbacks, layout count resolution (`requestedCount ?? artworks.length`), and delegates to `ClipPathRenderer`.
- **`TriangleRenderer.tsx`**: 8-line sub-renderer delegating to `PresetRenderer` with `TRIANGLE_PRESETS`.
- **`FanRenderer.tsx`**: 8-line sub-renderer delegating to `PresetRenderer` with `FAN_PRESETS`.
- **`DiamondRenderer.tsx`**: 8-line sub-renderer delegating to `PresetRenderer` with `DIAMOND_PRESETS`.

### Presets & Helpers (`src/renderer/src/constants/` & `src/renderer/src/utils/`)
- **`trianglePresets.ts`**: Declarative `TRIANGLE_PRESETS: LayoutPreset<TriangleStyle>`.
- **`fanPresets.ts`**: Declarative `FAN_PRESETS: LayoutPreset<FanStyle>`.
- **`diamondPresets.ts`**: Declarative `DIAMOND_PRESETS: LayoutPreset<DiamondStyle>` (100% non-overlapping 5-polygon tessellation).
- **`getLayoutClipPaths.ts`**: Single source of truth helper returning CSS clip-paths for any layout, style, and slot count (used by both renderers and interactive preview overlays).

---

## 3. Interactive Cover Editor Pipeline (`Phase 3D`)

- **`PlaylistCoverSettingsPrompt.tsx`**: Owns active/hover/focus slot states (`activeSlotIndex`, `hoveredSlotIndex`, `focusedSlotIndex`), targeted replacement logic, slot clearing, and position swapping.
- **`CoverLivePreview.tsx`**: Renders `MultipleArtworksCover` with interactive single-source-of-truth polygon overlay using `getLayoutClipPaths()`. Renders position badges (①..⑤) and active/hover glow rings.
- **`SelectedSongsReorderBar.tsx`**: Pure presentational slot bar receiving `effectiveSongs` resolved by `resolveEffectiveCoverSongs()`. Renders position cards with artwork, title, artists, `◀`/`▶` position swap controls, and `×` clear buttons.
- **`NumberedSongPicker.tsx`**: Selectable song list highlighting position badges (①..⑤) on selected songs.

---

## 4. Shared Type Contracts (`src/renderer/src/types/playlistCover.ts`)

```ts
export type PlaylistCoverLayout = 'grid' | 'triangle' | 'fan' | 'diamond';
export type ClipPathArtworkCount = 2 | 3 | 4 | 5;

export type TriangleStyle = 'diagonal' | 'pinwheel' | 'center';
export type FanStyle = 'standard';
export type DiamondStyle = 'classic';
export type CoverLayoutStyle = TriangleStyle | FanStyle | DiamondStyle | undefined;

export type CoverSlotIndex = 0 | 1 | 2 | 3 | 4;

export interface ActiveSlot {
  index: CoverSlotIndex;
}

export interface EffectiveCoverSlot {
  slot: CoverSlotIndex;
  song?: SongData;
  isFallback: boolean;
}

export type LayoutPreset<S extends string> = Record<S, Record<ClipPathArtworkCount, readonly string[]>>;

export interface CoverRendererProps {
  artworks: string[];
  layout: PlaylistCoverLayout;
  requestedCount?: number;
  style?: CoverLayoutStyle;
  className?: string;
  enableImgFadeIns?: boolean;
}
```

---

# 🚀 Future Phases Roadmap

## Phase 4A — Layout Styles

Now that renderers support styles:

### Triangle
- Diagonal
- Pinwheel
- Center

### Fan
- Standard
- Wide
- Tight

### Diamond
- Classic
- Hero
- Rotated

This is mostly adding geometry data to preset files (`trianglePresets.ts`, `fanPresets.ts`, `diamondPresets.ts`), not changing architecture.

---

## Phase 4B — Drag & Drop Ordering & Slot Model Evolution

Instead of

```
◀ ▶
```

allow

```
①
②
③
④
```

to drag.

Modern UX.

### Slot Model Evolution (`EffectiveCoverSlot`)

Evolve `resolveEffectiveCoverSongs(...)` to return `EffectiveCoverSlot[]`:

```ts
export interface EffectiveCoverSlot {
  slot: CoverSlotIndex;
  song?: SongData;
  isFallback: boolean;
}
```

Benefits for Phase 4+:
- default cover badge
- fallback indicator
- deleted song indicator
- drag/drop metadata
- animations
- future locking

---

## Phase 4C — Smart Auto Cover

This is a much bigger feature.

Instead of

> first 4 songs

generate from

- most played
- newest
- recently added
- highest rated
- random
- dominant artists
- dominant albums

This makes Auto Cover actually intelligent.

---

## Phase 4D — Layout Style Picker

Right now users choose

> Triangle

Eventually

> Triangle
> - ○ Diagonal
> - ○ Pinwheel
> - ○ Center

No renderer changes needed—just expose the style selection UI and persist the chosen style.

---

## Phase 4E — Visual Polish

Things like

- smooth morph animation when changing layouts
- hover transitions
- artwork fade
- better badges
- responsive scaling

---

# Overall Architecture Evaluation

After this refactor, I'd rate the cover system roughly like this:

- ★★★★★ Resolver purity
- ★★★★★ Renderer separation
- ★★★★★ Pluggable layouts
- ★★★★★ Shared geometry
- ★★★★★ Shared effective song resolver
- ★★★★☆ State organization
- ★★★★☆ Style system (foundation complete)
- ★★★★☆ UX
- ★★★☆☆ Drag/drop interactions

Compared to where this started (a couple of weeks ago), the architecture has become significantly cleaner. The major architectural work is largely complete now; the remaining phases are mostly about adding capabilities on top of the foundation rather than redesigning it. That usually means future layouts and editing features become much easier to implement.

---

# 🏛️ Playlist Cover System — Architectural & Implementation Invariants

These rules are **non-negotiable**. Every implementation phase must preserve them. Any code violating these invariants introduces architectural drift and should be rejected during review.

---

## 1. Pure Geometry Invariant
> Geometry preset files define layout shapes only. They must never contain business logic, renderer logic, component state, storage access, or React code.

---

## 2. Preset Data Invariant
> Preset files are immutable declarative data. They may not contain helper functions, resolver logic, side effects, business rules, or application state.

---

## 3. Backward Compatibility Invariant
> Existing layouts, variants, and persisted Playlist Cover settings must continue rendering correctly across future releases. Existing presets (`GRID`, `DIAGONAL`, `STANDARD_FAN`, `CLASSIC_DIAMOND`) must remain pixel-identical.

---

## 4. Variant Stability Invariant
> Variant identifiers (`diagonal`, `pinwheel`, `center`, etc.) are part of the persisted settings contract and must remain stable across releases. Existing identifiers must never be renamed.

---

## 5. Variant vs. Style Boundary
> `variant` represents geometric layout presets (e.g. `pinwheel`, `wide`, `hero`). `style` is reserved for future visual decoration (spacing, corner radius, shadows, overlays, etc.). These concepts must never be mixed.

---

## 6. Single Source of Truth Invariant
> Every piece of business logic must have exactly one implementation. Components may compose helpers but must never duplicate resolver logic.

Examples:
- `resolvePlaylistCover()`
- `resolveEffectiveCoverSongs()`
- `resolveAutoCoverArtworks()`
- `getLayoutClipPaths()`

---

## 7. Resolver Purity Invariant
> Resolver functions must be deterministic and side-effect free. They must never mutate inputs, access storage, modify React state, perform network requests, or perform persistence.

---

## 8. Renderer Purity Invariant
> Renderers are pure presentation components. They must never access localStorage, React Context, playlist state, or application services. They render exclusively from props.

---

## 9. Strategy Purity Invariant
> Auto Cover strategies evaluate available songs and return selections only. Strategies must never mutate playlist state, renderer state, or application state.

---

## 10. Draft vs. Persisted State Invariant
> During editing, every modification exists only in draft state. Playlist Cover settings are persisted only when the user explicitly saves.

Interaction flow:

```
User Interaction
        │
        ▼
Draft State
        │
        ▼
Live Preview
        │
        ▼
Save
        │
        ▼
Persistence
```

---

## 11. No Hidden Persistence Invariant
> No component, renderer, selector, drag interaction, or preview may write Playlist Cover settings directly. Persistence is performed exclusively by the explicit Save/Apply workflow.

---

## 12. Immediate Preview Invariant
> Every editing interaction must update the live preview immediately using the current draft state. The preview must always reflect the user's unsaved edits.

---

## 13. Parent Owns State Invariant
> `PlaylistCoverSettingsPrompt` owns all editor state. Child components are pure presentational or interaction components receiving state through props.

Parent-owned state includes:
- draft settings
- active slot
- hovered slot
- focused slot
- selected variant
- drag state

---

## 14. Component Responsibility Invariant
> Every component must have exactly one primary responsibility.

Examples:

- `CoverLivePreview` → Preview rendering only
- `VariantSelector` → Variant selection only
- `SelectedSongsReorderBar` → Slot reordering only
- `NumberedSongPicker` → Song selection only
- `MultipleArtworksCover` → Renderer dispatch only

Components must never absorb responsibilities from neighboring layers.

---

## 15. Dependency Direction Invariant
> Dependencies must always flow downward through the rendering pipeline.

```
PlaylistCoverSettingsPrompt
            │
            ▼
Resolvers
            │
            ▼
MultipleArtworksCover
            │
            ▼
Renderer Registry
            │
            ▼
Concrete Renderers
            │
            ▼
PresetRenderer
            │
            ▼
ClipPathRenderer
            │
            ▼
CoverImageTile
            │
            ▼
Geometry Presets
```

Reverse dependencies are prohibited.

---

## 16. Registry Invariant
> Renderer selection occurs exclusively through the renderer registry (`MultipleArtworksCover`). No other component may perform layout switching (`switch(layout)` or equivalent renderer dispatch).

---

## 17. Sticky Preview Invariant
> The workspace's left column remains sticky while the controls column scrolls independently. Large playlists must never push the preview off-screen during editing.

---

## 18. Accessibility Invariant
> Every interactive editor feature must remain fully accessible using keyboard navigation, visible focus indicators, semantic ARIA attributes, and equivalent non-pointer interactions.

---

## 19. Phase Boundary Invariant
> Every implementation phase must:
>
> - compile successfully
> - preserve all existing functionality
> - avoid placeholder implementations
> - avoid unrelated refactoring
> - modify only documented scope unless required for compilation
> - leave the application in a fully usable and testable state

---

## 20. Incremental Evolution Invariant
> New functionality must extend the existing architecture rather than redesign it. Future features should primarily add geometry presets, strategies, UI components, or editor capabilities without altering established architectural boundaries.

---

## 21. Testability Invariant
> All resolvers, strategies, geometry helpers, and transformation logic must remain independently testable without requiring React components, UI state, or persistence layers.

---

## 22. Future Compatibility Invariant
> All new persisted settings must be designed with forward compatibility in mind. Schema evolution should favor additive changes and maintain compatibility with previously saved Playlist Cover configurations.

---

## 23. Transient Drag Operation Invariant
> Drag operations are transient UI interactions. Dragging may modify only the draft slot order. No persistence, resolver mutation, renderer mutation, or application state updates occur until the user explicitly saves.

---

## 24. Strategy Registry Invariant
> All Auto Cover strategies must be registered exclusively through AutoCoverStrategyRegistry. Resolver logic must never instantiate or reference concrete strategy implementations directly.

---

## 25. Deterministic Strategy Invariant
> Except for strategies explicitly defined as random, identical inputs must produce identical outputs.

---

## 26. Presentation Purity Invariant
> Phase 4F must not modify resolver logic, strategy logic, persistence, state models, registry structure, or type contracts. All changes are limited to presentation, animation, transitions, visual feedback, and accessibility enhancements.

