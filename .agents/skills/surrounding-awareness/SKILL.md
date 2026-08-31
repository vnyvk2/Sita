---
name: surrounding-awareness
description: >
  Apply when writing or modifying code in this app — especially anything touching
  shared SQLite tables, background queues, sibling services (Last.fm, ListenBrainz,
  Spotify), Electron IPC, Drizzle migrations, AbortController/session handling, or
  TanStack Query invalidation. Provides a 3-phase methodology (planning →
  implementation → verification) to prevent breaking sibling services, legacy user
  databases, the main→renderer reactivity chain, or build output. Use before
  declaring any non-trivial backend, database, or cross-process change complete.
---

# Surrounding Awareness Skill — Nora Architecture & Invariants

## Triage Gate (30 seconds)

- **UI-only change (no storage, IPC, background queues, or service interactions):**
  Apply only **Phase 3 Steps 1 & 4** and Checklist rows 5–6 (build logs and visual smoke test).
- **Anything touching storage, services, IPC, migrations, background workers, or cache:**
  Apply **all phases (1, 2, and 3)** fully.

---

## The Prime Directive

> **Never evaluate an implementation solely within the narrow boundaries of the files you edited. Code is never an isolated island: it operates within a living ecosystem of shared database tables, sibling services, concurrent background workers, IPC boundaries, build bundlers, route generators, lifecycle events, and legacy user states.**
>
> **True engineering excellence requires constant "Surrounding Awareness" before writing code, during implementation, and after changes are made.**

---

## 1. Why Surrounding Awareness Matters

Symptom-level thinking asks: *"Does my new function work in its unit test?"*  
**System-level surrounding awareness asks:**
- *What existing shared systems or sibling services live in the same space, and could my change inadvertently degrade, clear, or starve them?*
- *What happens to existing users whose local databases or configs were created on older schema versions?*
- *How does this feature behave across the entire app lifecycle (startup, offline/online transitions, sleep/wake, window close, app quit)?*
- *Does the build system, bundler, route generator, or type checker emit subtle warnings or suboptimal chunks because of where files were placed or imported?*
- *When state changes in the backend, does the entire frontend reactivity chain (IPC → React Query → Context → UI) update seamlessly without stale caches or forced restarts?*

---

## 2. Phase 1: Planning-Time Surrounding Awareness

Before touching code, map the surrounding ecosystem:

### 1. Shared Storage & Sibling Service Coexistence
- **Shared Tables / Queues:** If you are using a shared table (e.g., `scrobble_queue`, `user_settings`, `songs`), identify **all other consumers** of that table.
- **Service Isolation:** When Service A clears its queue, resets state, or handles an error, ensure it filters strictly by its own scope (`service: 'serviceA'`) rather than wiping shared resources (`DELETE FROM shared_table`).
- **Coexistence Guarantee:** Can Service A and Service B both be enabled simultaneously without competing for locks, overwriting each other's state, or colliding on background intervals?

### 2. Schema Evolution & Legacy Database Invariants
- **Do not rely on `CREATE TABLE IF NOT EXISTS` for migrations:** On existing installations, SQLite `CREATE TABLE IF NOT EXISTS` is a no-op and will NOT add new columns.
- **Unversioned / Legacy DB Detection:** Never assume `PRAGMA user_version = 0` means an empty database. Distinguish between a brand-new install (`SELECT count(*) FROM sqlite_master WHERE name='user_settings'`) and an unversioned legacy database with existing tables.
- **Defensive Self-Healing / Schema Repair:** Inspect runtime table info (`PRAGMA table_info`) or column presence dynamically so that partially migrated, dirty, or corrupted dev databases self-heal automatically on boot without crashing Drizzle ORM queries.

### 3. Build & Bundler Impact Analysis
- **Route File Scanners (TanStack Router):** Placing test files (`*.test.tsx`) inside route directories causes route generators to emit warnings unless properly ignored via `routeFileIgnorePattern: '.((test|spec).(js|jsx|ts|tsx))'`.
- **Dynamic Import Efficiency:** Avoid circular or dual static/dynamic imports that cause `[INEFFECTIVE_DYNAMIC_IMPORT]` bundler warnings.
- **Process Boundaries:** Verify that code intended for the Node main process never imports renderer React code, and renderer code never accesses Node/Electron internals directly.

---

## 3. Phase 2: Implementation-Time Surrounding Awareness

While coding, uphold these cross-system invariants:

```
                  ┌─────────────────────────────────────┐
                  │          App Lifecycle              │
                  │ (Boot, Shutdown, Reconnect, Sleep)  │
                  └──────────────────┬──────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         ▼                           ▼                           ▼
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│ Sibling Services │       │ Storage & Schema │       │ Reactivity Chain │
│ (Last.fm, LB,    │       │ (SQLite, Outbox, │       │ (IPC, TanStack   │
│  Spotify, etc.)  │       │  SafeStorage)    │       │  Query, Reducers)│
└──────────────────┘       └──────────────────┘       └──────────────────┘
```

### 1. The Full Reactivity Chain & Invalidation Mapping
When state changes in the main process:
1. Main process executes mutation & persists to SQLite.
2. Main process dispatches targeted `dataUpdateEvent(dataType)`.
3. Preload bridge relays event to renderer.
4. `useDataSync.tsx` maps `dataType` to precise `InvalidationTargetKey`s without requiring manual page refreshes.

#### Authoritative `dataUpdateEvent` → `InvalidationTargetKey` Map:

| Event `dataType` | `InvalidationTargetKey`s Triggered | Queries Invalidated in React Query |
|---|---|---|
| `'songs'`, `'songs/newSong'`, `'songs/deletedSong'`, `'blacklist/songBlacklist'` | `'songs:all'`, `'songs:ids'`, `'songs:facets'`, `'songs:recentlyAdded'`, `'songs:history'`, `'search:query'`, `'home:recentlyPlayedSongs'`, `'analytics:listening'`, `'analytics:libraryStats'` | `songQuery.all`, `songQuery.ids`, `songQuery.facets`, `songQuery.recentlyAdded`, `songQuery.history`, `searchQuery.query`, `homeQuery.recentlyPlayedSongs`, `analyticsQuery.listening`, `analyticsQuery.libraryStats` |
| `'songs/updatedSong'` | `'songs:all'`, `'songs:ids'`, `'songs:facets'`, `'songs:recentlyAdded'`, `'songs:history'`, `'search:query'`, `'home:recentlyPlayedSongs'`, `'analytics:listening'` | Song lists, facets, search query, listening stats |
| `'songs/likes'` | `'songs:favorites'`, `'home:mostLovedSongs'`, `'songs:singleInfo'`, `'songs:windows'` | `songQuery.favorites`, `homeQuery.mostLovedSongs`, `songQuery.singleSongInfo`, active song hydration windows |
| `'songs/artworks'` | `'songs:all'`, `'songs:allInfo'`, `'songs:singleInfo'`, `'songs:windows'`, `'albums:all'`, `'albums:single'` | Song artwork, single info, album listings |
| `'artists'`, `'artists/newArtist'`, `'artists/updatedArtist'`, `'artists/deletedArtist'` | `'artists:all'`, `'artists:single'`, `'home:recentSongArtists'`, `'search:query'`, `'analytics:listening'` | `artistQuery.all`, `artistQuery.single`, `homeQuery.recentSongArtists` |
| `'artists/likes'`, `'artists/artworks'` | `'artists:all'`, `'artists:single'` | `artistQuery.all`, `artistQuery.single` |
| `'albums'`, `'albums/newAlbum'`, `'albums/updatedAlbum'`, `'albums/deletedAlbum'`, `'albums/likes'` | `'albums:all'`, `'albums:single'`, `'search:query'`, `'analytics:listening'` | `albumQuery.all`, `albumQuery.single` |
| `'genres'`, `'genres/newGenre'`, `'genres/updatedGenre'`, `'genres/deletedGenre'` | `'genres:all'`, `'genres:single'`, `'analytics:listening'` | `genreQuery.all`, `genreQuery.single` |
| `'playlists'`, `'playlists/*'` | `'collections:all'`, `'home:recentlyPlayedSongs'` | `collectionKeys.all`, `homeQuery.recentlyPlayedSongs` |
| `'userData'`, `'userData/theme'`, `'userData/window*'`, `'settings/preferences'` | `'settings:all'` | `settingsQuery._def` |
| `'userData/recentSearches'` | `'search:recentResults'` | `searchQuery.recentResults` |

### 2. Complete Lifecycle Coverage
- **Startup Flush:** Does the app flush pending background queues (`scrobble_queue`, sync tasks) on startup (`src/main/main.ts`)?
- **Online/Offline Resilience:** When network transitions from offline to online (`useNetworkConnectivity.tsx`), does the system automatically resume paused operations and flush the outbox?
- **Cancellation & Abort Signals:** When a user logs out, switches accounts, skips tracks, or navigates away, are in-flight network requests immediately aborted via `AbortController`?
- **Session Generations:** Increment a monotonic session counter on account changes so in-flight requests from a previous session are discarded before committing to storage.

### 3. Non-Destructive Error Boundaries
- **Transient vs Permanent Failure:** Distinguish 429 (rate-limit backoff) and 5xx (server error retry) from 400/404 (permanent bad request drop) and 401 (session invalidation).
- **Clock Skew Defense:** Never submit timestamps that lie in the future relative to the external server; clamp `Math.min(recordedTime, currentTime)`.

---

## 4. Phase 3: Post-Implementation Surrounding Verification

After implementing, do NOT stop at running a single isolated unit test. Perform this rigorous 4-step verification:

### Step 1: Real Runtime Boot & Log Inspection
Run the development server and inspect the startup logs:
- Did the app boot cleanly without SQLite column/table errors?
- Are there any unhandled promise rejections, deprecation warnings, or bundler warnings?
- Did TanStack router generate routes cleanly without warnings about stray test files?

### Step 2: Legacy Database Migration Verification
- Test opening existing database files with previous versions (`user_version = 0`, `user_version = 1`, and broken states).
- Verify that all newly added columns are present in `PRAGMA table_info(<table_name>)`.
- Ensure zero data loss for existing user data, favorites, playlists, and settings.
- Run the engine test suite:
  ```bash
  npm test -- test/src/main/db/sqlite/sqlite-engine.test.ts
  ```

### Step 3: Sibling Coexistence Verification
- If working on a multi-service subsystem (e.g., scrobbling, metadata, lyrics):
  - Connect Service A and Service B simultaneously.
  - Verify operations trigger for both services concurrently.
  - Disconnect Service A → verify Service B remains connected and its queue items remain untouched.
- Run multi-service test suites:
  ```bash
  npm test -- src/main/other/listenBrainz/__tests__/listenBrainz.test.ts src/main/other/lastFm/__tests__/flushScrobbleQueue.test.ts
  ```

### Step 4: Full Monorepo Regression Audit
- Run Node typechecking:
  ```bash
  npm run typecheck:node
  ```
- Run targeted test suites for your subsystem and adjacent modules:
  ```bash
  npm test -- test/src/main/db/sqlite/sqlite-engine.test.ts src/main/other/listenBrainz/__tests__/listenBrainz.test.ts src/main/other/lastFm/__tests__/flushScrobbleQueue.test.ts
  ```
- Verify zero regressions in surrounding modules.

---

## 5. Surrounding Awareness Checklist ("The Look-Around Matrix")

Before declaring any implementation complete, verify each cell:

| Dimension | Question to Answer | Verified? |
|---|---|---|
| **Sibling Coexistence** | Did I isolate queue operations, storage keys, and sessions so other services are not wiped or blocked? | [ ] |
| **Database Migrations** | Will an existing user upgrading from v1 or unversioned DB get all columns without manual reset? | [ ] |
| **Network Lifecycle** | Does the subsystem automatically queue when offline and resume/flush when online? | [ ] |
| **In-Flight Cancellation** | Are aborted requests, account switches, and skips cleanly canceled without hanging promises? | [ ] |
| **UI State Invalidation** | Does the frontend UI update immediately via IPC `dataUpdateEvent` and React Query invalidation? | [ ] |
| **Build & Bundler Logs** | Are terminal dev logs free from route generator warnings, circular imports, and unhandled errors? | [ ] |
| **Security & Secrets** | Are tokens/keys encrypted via `safeStorage` and masked in the UI? | [ ] |
| **Regression Safety** | Did all existing engine, sibling, and integration tests pass green? | [ ] |
