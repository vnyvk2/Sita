# B-Fix Design: Windowed Hydration Data Layer

Status: PROPOSAL — no code changes yet
Scope guard: PGlite stays. No worker infrastructure. No user-visible queue/shuffle behavior change.

## 0. Problem recap (measured)

- `getAllSongs` full-library hydration: 1,297 songs → 1.29 MB JSON, 0.7–1.7 s per fetch
- Every sort/filter/search key caches its own full-library copy in React Query
- Any `songs*` event wholesale-invalidates `songQuery.all._def` → transient double-memory + freeze
- Albums embed per-album song lists (O(total tracks) across the grid)
- Queue page materializes full `SongData` for every queued id

## 1. Core idea: ID-first lists + windowed hydration

Lists transfer **only sorted/filtered ID arrays** (8 bytes/song). Row objects hydrate
**per viewport window** (~200 rows/chunk) through the existing `app/getSongInfo`
handler, which already supports `preserveIdOrder` and internal >500-id chunking
(`db/queries/songs.ts:219-240,288-303`).

The backbone already exists: `getAllSongIds(sortType, filterType)` with SQL-side
ORDER BY + favorites/blacklist filters (`db/queries/songs.ts:376-429`).

### Why this beats full pagination here

Virtuoso needs total count + index→item mapping. An ID array gives O(1) index access,
stable scroll restoration, instant "select all", jump-to-letter, and Play-All —
all operating locally on ids — while payloads stay ~KB-scale at any library size.
True server-pagination would break select-all/jump UX for no extra memory win
(ids are already ~linear-cheap: 500k songs ≈ 4 MB as ids vs ~1 GB hydrated).

## 2. Main-process changes

### 2.1 Extend `getAllSongIds` → `getFilteredSongIds`

File: `src/main/db/queries/songs.ts` (extend existing function)

Add SQL-side support for the four client-side sub-filters currently applied in the
renderer (`routes/main-player/songs/index.tsx:198-242`):

| Filter | SQL strategy | Tables/indexes |
|---|---|---|
| language | `s.language = $1 OR override.stringValue = $1` (leftJoin metadataOverrides, entityKind='song', fieldId='language'); `unspecified` ⇒ both null/empty | `idx_metadata_overrides_lookup` exists |
| genre | exists-join songsGenres→genres (case-insensitive name match) | genres relation exists |
| onlyFavoriteArtists | exists-join songsArtists→artists where `isFavorite` | relation exists |
| onlyFavoriteAlbums | exists-join albumsSongs→albums where `isFavorite` | relation exists |

Return `{ ids: number[], total: number }`. Keep current filters (favorites,
blacklist) and all 13 sort mappings identical to `getAllSongs` ordering clauses
(`asc/desc(songs.title)` etc.) so ordering is byte-compatible with today's
non-chunked path.

Also expose distinct-value facets endpoint:

```
app/getSongListFacets -> { languages: string[], genres: string[] }
```
(languages from `songs.language` UNION overrides; genres from genres table).
Replaces building dropdown sets from the full library (`index.tsx:144-169`).

### 2.2 Fix `getSongInfo` dead param

`core/getSongInfo.ts:13` accepts `limit` but ignores it. Either honor it or remove
the parameter from the preload signature. Windows pass explicit id slices, so the
param becomes unnecessary — prefer removal for clarity (preload signature change,
renderer-only callers).

### 2.3 Album summaries without song lists

New query in `db/queries/albums.ts`: `getAlbumSummaries(options)` — same
where/orderBy as `getAllAlbums` but **no `songs` join**, adding
`songCount` (correlated `$count` on albumsSongs). Payload ≈ 300 B/album.

Keep `getAllAlbums` untouched for consumers needing one album's songs (album
detail view is bounded — one album's id+title pairs).

No new indexes required: `idx_albums_title`, `idx_albums_year_title`,
`idx_albums_is_favorite` cover sorts/filters; songs-table indexes
(`idx_songs_title`, `idx_songs_year_title`, `idx_songs_created_title`,
`idx_songs_modified_title`, `idx_songs_skip_count_title`, `idx_songs_favorite_title`,
`idx_songs_track_title`, `idx_songs_language`) already cover every ID-query
ordering/filter combination. **Zero schema migrations in B.**

## 3. Renderer changes

### 3.1 Query keys (`queries/songs.ts`, `queries/albums.ts`)

```
songQuery.ids({ sortType, filterType, language?, genre?, favArtists?, favAlbums? })
  -> ['songs','ids', ...params]           staleTime 5m, gcTime 30m,
                                             placeholderData: keepPreviousData
songQuery.window({ idsVersion, start, end })
  -> ['songs','window', idsVersion, start]  staleTime 10m, gcTime 5m
  queryFn: getSongInfo(ids.slice(start,end), undefined, undefined, undefined, true)
songQuery.facets() -> ['songs','facets']    staleTime 30m
albumQuery.summaries({ sortType, filterType, start, end })  // paginated pages of ~120
albumQuery.summaryWindow(...)               // if grid virtualization prefers windows
```

`idsVersion` = monotonic counter derived from the ids query's `dataUpdatedAt`
(placeholderData keeps previous list mounted while the next version loads — no
scroll jumps, no blank flash).

Cache-size bound: ids arrays are trivial; windows accumulate ≤ (visited ranges ×
~200 KB). gcTime 5 m evicts cold windows; a hard cap (LRU ≥ 40 windows/query) is a
cheap safety valve if benchmarks show drift.

### 3.2 VirtualizedList range hook

Extend `components/VirtualizedList.tsx` (and `VirtualizedGrid.tsx`) to surface
Virtuoso's `rangeChanged` → `useWindowHydration(ids, { overscanRows })`:

- computes needed `[start,end)` = visible ± 25 rows aligned to 200-row windows
- fires `useQueries` for missing windows; returns `getItem(index)` returning
  `SongData | undefined`
- rows render existing skeleton state when `undefined` (Song row already memoized;
  add a minimal loading branch)

`filteredSongs` in `songs/index.tsx` becomes `filteredSongIds` (pure ids);
`renderSong(index)` looks up via `getItem(index)`.

Sub-filter UI reads `songQuery.facets()` instead of iterating the library
(`index.tsx:144-196` deleted).

Play All / Shuffle (`index.tsx:514-537`) switch source array from
`filteredSongs.map(s => s.songId)` to `filteredSongIds.filter(id => !blacklistedIds.has(id))`
— blacklist flags come back inside hydrated windows; for unhydrated tails fall back
to `notBlacklistedCount === ids.length` fast-path or a 2-column id+flag facet query
(decided at implementation: facet endpoint returns `{id,isBlacklisted}` pairs, 12 B/song).
**createQueue input remains an id array → queue semantics byte-identical.**

Select-all (`useSelectAllHandler`) likewise receives ids.

### 3.3 Albums page

Grid switches to `albumQuery.summaries` pages (or windows). `Album.songs` stops
existing on grid objects; album-detail consumers read from the existing single-album
query (`albumQuery.single` / collection entries) which stays as-is.

Type impact: `Album` type loses `songs` — compile errors enumerate every consumer;
each is either the grid (→ summaries) or a detail view (→ single query).

### 3.4 Queue page

`routes/main-player/queue/index.tsx:115-127` replaces the one-shot
`songQuery.queue(all ids)` + `Map` with the same windowed hydration over
`currentQueue` (order = queue order, `preserveIdOrder=true`).
`membershipVersion` bumps naturally version window keys.

Suffix durations (`calculateQueueSuffixDurations`) need durations for arbitrary
members: new tiny endpoint `app/getSongDurations(ids) -> [{id,duration}]`
(~16 B/id, column-only select) fetched once per membershipVersion; progressive
display acceptable while loading.

Queue DATA model untouched: `playerQueue.ts` keeps `songIds: number[]`;
shuffle/history/position logic (`playerQueue.ts:725-789` etc.) unmodified.

## 4. Invalidation strategy (surgical)

Current: any structural `songs*` event → invalidate `songQuery.all._def`
(`hooks/useDataSync.tsx:53-66`). After B, bulk keys are gone; replacement:

| Event class | Action |
|---|---|
| `songs`, `songs/newSong`, `songs/deletedSong`, `blacklist/songBlacklist` | invalidate active `songQuery.ids` + `facets` + album summaries (cheap: id-array refetch). Windows self-heal: new `idsVersion` makes old windows unreachable → gcTime eviction |
| `songs/updatedSong`, `songs/artworks` | if `eventData.data` carries song ids (type already supports `eventData:{data?:number[]}` — `app.d.ts:1311-1314`): map id→index via current ids array → invalidate exactly the containing window keys + `singleSongInfo[id]`. Fallback when ids absent: bump ids version (same as structural) |
| `songs/likes` | same surgical path (row hearts live in hydrated copies); plus existing `songs:favorites` targets |
| albums events | invalidate `albumQuery.summaries/pages`; single-album queries per existing `albums:single` |

Implementation home: extend `getInvalidationTargetsForEvent`/`invalidateTarget`
with two new target kinds (`songs:ids`, `songs:windows`) and pass `eventData.data`
through `DataSyncBatcher` (currently drops it — `handleEvents` sees only
`dataType`). Batched RAF dedupe preserved.

Net effect: editing one tag no longer refetches 1.29 MB×N; it refetches ≤1 window
(~200 KB worst case, typically ~40 KB visible slice).

## 5. Exact affected files

Main:
- `src/main/db/queries/songs.ts` — extend `getAllSongIds`; add facets query
- `src/main/db/queries/albums.ts` — add `getAlbumSummaries`
- `src/main/core/getSongInfo.ts` — remove/honor `limit`
- `src/main/ipc.ts` — register `app/getFilteredSongIds`, `app/getSongListFacets`,
  `app/getAlbumSummaries`, `app/getSongDurations`
- `src/preload/index.ts` — expose the four new controls (+ remove dead `limit`)
- `src/main/core/getAllSongs.ts` — unchanged (still used by other callers)

Renderer:
- `src/renderer/src/queries/songs.ts`, `queries/albums.ts` — new keys
- `src/renderer/src/hooks/useDataSync.tsx` — event payload passthrough + new targets
- `src/renderer/src/hooks/useWindowHydration.ts` — NEW
- `src/renderer/src/components/VirtualizedList.tsx`, `VirtualizedGrid.tsx` — range callback prop
- `src/renderer/src/routes/main-player/songs/index.tsx` — ids-first rewrite of
  data section (filters memo, facets, renderSong lookup, play-all/select-all sources)
- `src/renderer/src/routes/main-player/albums/index.tsx` — summaries + windows
- `src/renderer/src/routes/main-player/queue/index.tsx` — windowed rows + durations
- `src/@types` / `src/types/app.d.ts` — `Album` type: drop `songs`; new API types

Out of scope (phase 2, same recipe): artists/genres/favorites/history pages,
`AddSongsToTargetPlaylistPrompt` (fetches whole library for a dialog — swap to
`getFilteredSongIds` opportunistically).

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| SQL sub-filter results ≠ old client-side results (language casing, `unspecified`, genre case, fav joins) | Golden-master harness: run old pipeline vs new `getFilteredSongIds` across the 16-combo sub-filter matrix × each sortType against the real 1.3k DB dump; diff must be empty |
| Order parity vs legacy JS `localeCompare` path (>500-id chunk branch) | Same golden-master compares sequences; production default path was SQL ORDER BY already |
| Skeleton flash on first paint / slow window | Loader prewarms ids + first window (`ensureQueryData`), replacing today's full-library prewarm; skeletons only on fast-scroll overshoot |
| Scroll jump on ids refetch | `placeholderData: keepPreviousData` + version-keyed windows (old DOM stays until swap) |
| Window key explosion | gcTime 5 m + LRU cap; windows are 200-row aligned so count stays small |
| Events without ids in `eventData` | Dual-mode: surgical when ids present, version-bump otherwise (still ≤ 1 id-array refetch, no bulk hydration) |
| `Album` type removal ripples | Compiler-driven; detail views migrate to single-album query; grep-audited |
| Blacklist flag availability before hydration for Play-All | `{id,isBlacklisted}` facet pairs (12 B/song) or deferred-filter inside createQueue as today |

Migration risk: **low** — additive IPC + additive query keys; old handlers remain
during transition; feature-flagged page conversion (`isWindowedLibrary` pref,
default off) allows A/B and instant rollback. No DB migration. No queue-model change.

## 7. Benchmarks & acceptance criteria

Tooling: extend memProfiler scenario (worktree build) with steps: songs-open,
scroll-to-middle, sort-switch, language-filter-switch, single-tag-edit, like-toggle,
albums-open, queue-open; ipc.jsonl already captures per-call ms/bytes/count.
Synthetic 50k-library generator script (inserts fake rows into the profiled PGlite
data dir — test data only, engine untouched).

| # | Criterion | Target |
|---|---|---|
| AC1 | Songs open payload @1.3k | ≤ 200 KB total IPC (vs 1,294 KB) |
| AC2 | Songs open payload @50k synthetic | ≤ 300 KB; ids call < 150 ms |
| AC3 | Time-to-first-rows @50k | < 400 ms after window fetch |
| AC4 | Sort switch @50k | < 200 ms to painted rows (local ids + window reuse where overlapping) |
| AC5 | Sub-filter switch @50k | < 150 ms SQL round-trip + paint |
| AC6 | Renderer heap growth 1.3k → 50k | < +40 MB steady-state on Songs page |
| AC7 | Tag-edit propagation | exactly one window refetch in ipc.jsonl; UI updated < 1 s; zero full-library calls |
| AC8 | Albums grid payload | ≤ 350 B × albumCount; zero song-object transfers |
| AC9 | Queue page @10k-item queue | no full SongData materialization; scroll smooth (frame gaps < 50 ms during programmatic scroll) |
| AC10 | Queue semantics | existing playerQueue/queuesManager unit tests green; golden id-sequence equality for createQueue/shuffle/next/remove flows |
| AC11 | Golden-master filter/order parity | zero diffs across matrix |
| AC12 | Regression suite | vitest green, oxlint clean, no new typecheck errors |
| AC13 | Full memory matrix re-run (L3) | renderer PM delta ≥ −50 MB @1.3k; flat growth curve at 50k |

Benchmark protocol: N≥3 runs per metric before/after, medians reported, same
machine/profile-copy method as the measurement report.

## 8. Implementation order

P1 main endpoints + preload (behind flag, additive)
P2 `useWindowHydration` + VirtualizedList range prop + Songs page conversion
P3 invalidation rewiring (payload passthrough + surgical targets)
P4 Albums summaries/grid
P5 Queue page windows + durations endpoint
P6 Golden-master harness + 50k generator + benchmark runs → report

Each phase lands independently revertible; benchmarks run after P2 (early signal),
P5 (feature-complete), P6 (final acceptance).
