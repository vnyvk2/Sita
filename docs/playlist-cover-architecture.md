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
