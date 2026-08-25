# Canonical All Songs Queue — Architecture & Phase 1 Spec

## Purpose

The All Songs library view is a **canonical library view, not a temporary playback context**. Playing from it must not spawn a new queue tab on every interaction. The library is the **source of truth**; the canonical All Songs queue is only the **active playback projection** of it.

## Domain Model: stable identity, disposable content

```text
Canonical All Songs Queue
        │
        ├── stable queue ID            (tab does not jump around)
        ├── stable canonical identity  (metadata.queueType === 'songs' + metadata.isCanonical)
        └── replaceable songIds        (projection of the library; regenerated on demand)
```

The canonical queue is never the source of truth for All Songs. Its `songIds` array is a cache of
"the current library, minus blacklisted songs, in the user's current sort order", and it may be
regenerated at any time without changing the queue's identity.

## Locked Invariants

1. **At most one canonical All Songs queue** exists across the entire app at any time:
   `queues.filter(q => q.metadata.queueType === 'songs' && q.metadata.isCanonical).length <= 1`.
2. **Canonical content is derived from the current library**, excluding whatever the normal All
   Songs view excludes (blacklisted songs). It is never hand-maintained.
3. **Playing All Songs reuses the canonical queue when it is still valid** (fresh + already active
   ⇒ zero allocation, zero structural churn; only the position moves).
4. **A structural edit detaches it**: remove / add / clear / play-next on the canonical queue
   demotes it (`isCanonical: false`, renamed to a free `Queue N` title) and **keeps the edit**.
   Shuffle / restore-from-shuffle / position changes are playback state, NOT structural edits —
   they never detach.
5. **The next All Songs playback creates/rebuilds the canonical queue** after a detach or when none
   exists. Deletion of the canonical queue by the user is allowed; it is recreated idempotently on
   demand.
6. **Never use `currentSongId`'s append fallback to repair a canonical queue.** If a requested song
   is not present in the canonical queue, the queue is stale and must be rebuilt/validated instead;
   the setter refuses to append for canonical queues.
7. **`libraryVersion` handles staleness**, not ID-array comparison. A monotonic counter is bumped on
   structural library events (`songs`, `songs/newSong`, `songs/updatedSong`, `songs/deletedSong`,
   `blacklist/songBlacklist`). Canonical queues record `metadata.builtAtLibraryVersion`; mismatch ⇒
   stale ⇒ rebuild on next canonical play request.
   **Provenance stamping:** callers attest which version their `songIds` were actually derived from
   (`builtAtLibraryVersion` request option), and the manager stamps _that_ value — never the live
   counter alone. A request served from a not-yet-refetched React Query cache during a
   library-update race therefore stays honestly "stale" and self-heals on the next request instead
   of being poisoned as fresh while holding pre-update IDs.
8. **Filtered sources remain contextual queues.** Any active keyword or sub-filter (genre, language,
   favorite artists, favorite albums) on the Songs page means the request is a _filtered browse_
   context: it spawns an independent contextual queue titled `All Songs: <filter>` and does not
   participate in canonical reuse.
9. **Sort-order awareness.** The projection records the `sortingOrder` it was built from. A changed
   sort is treated as a reorder requirement: an un-shuffled canonical queue rebuilds in place with
   the new arrangement; a **shuffled** queue stays on the fast path untouched, because playback
   order is the permutation and source order is irrelevant (the new sort is adopted at the next
   non-shuffled rebuild). Projections without a sort stamp (legacy state) silently adopt the first
   incoming sort without rebuilding.

> **Editable ⇒ not canonical.** A queue that the user can curate cannot simultaneously claim to be
> the canonical All Songs projection. This one rule replaces every special case around "removed a
> song from All Songs but still playing it".

## Enforcement location

All routing and detachment live in the **queue domain** (`QueuesManager`), never in UI components:

- `QueuesManager.getOrCreateCanonicalQueue(options)` — the single entry point for unfiltered
  All Songs playback requests (Songs page click, Play All, Shuffle And Play, startup default queue).
- `QueuesManager.detachCanonicalQueue(queueId)` — demote transition.
- Detachment triggers are bound once per queue in `bindQueueEvents` via existing PlayerQueue events,
  with suppression guards for store-sync replacement (`isSyncingFromStore`) and manager-initiated
  canonical refreshes.

UI layers (`useQueueManagement`, `SongsPage`, `useAppLifecycle`) only decide _whether_ a request is
canonical-eligible (unfiltered vs filtered) and pass fresh song IDs; they cannot implement divergent
semantics.

## Play-request resolution algorithm

Given a canonical-eligible play request `{ songIds?, startSongId?, shuffle?, startPlaying?, title? }`:

```text
1. No canonical queue exists
     → create one from songIds with metadata {queueType:'songs', isCanonical:true,
       builtAtLibraryVersion:<caller-attested>, sortingOrder:<caller's>, title};
       activate; apply shuffle/jump/play.

2. Canonical queue exists
     a. shuffle requested
          → refresh songIds in place if stale, then re-permute (shuffle), activate, play from 0.
     b. already active AND fresh AND (sort unchanged OR shuffled) AND target song present
          → fast path: moveToPosition(startSongId index) or moveToStart(). Zero churn;
            preserves queueBeforeShuffle mid-shuffle.
     c. otherwise (inactive, stale, or un-shuffled sort change)
          → rebuild in place via guarded replaceQueue (same queue object, same ID),
            update builtAtLibraryVersion + sortingOrder stamps, activate, jump/play.
```

## Migration & legacy state

- Stored queues created before this feature carry `queueType: 'songs'` but no `isCanonical` flag.
  They are **not promoted**; they keep behaving as normal contextual queues until the user deletes
  them, and the next canonical play request creates a fresh canonical queue alongside them.
- On `initialize()`, if restored state contains more than one canonical-marked queue (corrupted or
  hand-edited storage), all but one are silently demoted so invariant 1 holds from boot.

## What is intentionally NOT built (Phase 1)

- ❌ Content-equality detection between queue and library (O(n) diffing).
- ❌ Live incremental sync of the canonical queue while it plays (new scans appear on next
  canonical play initiation — predictable and sufficient).
- ❌ Blocking user edits; blocking canonical deletion; single-queue mode.
- ❌ Forcing contextual sources (album/artist/playlist/genre/folder/favorites/history) through any
  canonical logic.

## Acceptance criteria (tested)

1. Repeated unfiltered plays produce **0 new queues** and reuse one instance.
2. Fast path does not bump `structureVersion` (no serialization churn).
3. Stale canonical queue rebuilds in place: same queue ID, new `songIds`, refreshed version stamp.
4. `removeSongId` / `playNext` / `addSongIdToEnd` / `clear` on the canonical queue detach it
   (edit preserved, renamed); the next canonical play builds a new canonical queue.
5. `shuffle()` / `restoreFromShuffle()` do **not** detach.
6. Store-sync-driven `replaceQueue` does **not** detach.
7. Filtered requests create independent contextual queues, never touching the canonical one.
8. Legacy stored `'songs'` queues are not promoted; duplicate canonicals collapse at boot.
9. `currentSongId = x` on a canonical queue missing `x` does not append.
