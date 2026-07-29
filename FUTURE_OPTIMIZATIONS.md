# Future Architecture Optimizations & Technical Debt

This document tracks future architectural optimizations, design constraints, and technical debt items identified during the implementation of the Collection Platform (Phases 1-11). It ensures that important scaling and extensibility considerations are not forgotten as the application evolves.

---

## 1. Smart Playlist Engine Scalability

### 1.1 Inverted Index for Dependency Resolution
**Context:** When a library event occurs (e.g., `SongPlayCountChanged`), the `SmartPlaylistScheduler` currently fetches all smart playlists from the database and checks their cached `dependencies` in memory to see which ones are affected.
**Issue:** If a user scales to hundreds or thousands of smart playlists, this `O(N)` scan becomes a bottleneck.
**Solution:** Build and maintain an in-memory inverted index:
```text
playCount -> [playlist_1, playlist_5, playlist_8]
artist    -> [playlist_2, playlist_7]
```
When an event fires, `O(1)` lookup retrieves exactly which playlists to regenerate.

### 1.2 Incremental Playlist Regeneration
**Context:** `SmartPlaylistEngine.regenerate(playlistId)` currently deletes all entries and re-evaluates the query to bulk-insert the new state.
**Issue:** For libraries with hundreds of thousands of songs, bulk deletion and insertion for a 50,000-song smart playlist is inefficient.
**Solution:** Implement incremental regeneration. By diffing the new execution plan's results against the existing `playlist_entries` or reacting strictly to the delta introduced by the library event, you can perform targeted `INSERT` and `DELETE` operations rather than full rebuilds.

### 1.3 Dependency Categories
**Context:** `DependencyAnalyzer` currently checks individual fields (e.g., `title`, `artist`, `playCount`).
**Issue:** As the number of fields grows, fine-grained field comparison becomes tedious.
**Solution:** Evolve the analyzer to use broader categories (e.g., `metadata`, `statistics`, `library`). A change to `playCount` just invalidates the `statistics` category, making dependency logic cleaner.

---

## 2. Compiler & Planner Extensibility

### 2.1 ExecutionPlan as the Hard Boundary
**Context:** The `QueryPlanner` handles domain relationships, while the `SmartPlaylistCompiler` only translates an `ExecutionPlan` into SQL.
**Constraint:** Do not let the compiler "peek behind the curtain." As new capabilities are added (e.g., tags, moods, album artists, custom metadata), **enrich the `QueryPlanner` and the `ExecutionPlan`** rather than leaking relationship logic into the compiler. The compiler should always remain purely a SQL translator.

---

## 3. General Architecture

### 3.1 Architecture Overview Documentation
**Context:** The Collection Platform introduces many layers (AST, Compiler, Operations, Undo/Redo Engine, Queue Engine).
**Action Item:** Draft a 2–5 page Architecture Overview document that formally explains:
- Layer responsibilities
- Dependency flow
- Engine interactions
- Operation lifecycle
- Undo/Redo model
- Queue subsystem

This document will be invaluable for onboarding contributors or returning to the codebase months later.

### 3.2 Singleton Enforcement
**Context:** Core engines like `SmartPlaylistScheduler` rely on event listeners and debouncers.
**Constraint:** Ensure these classes strictly remain singletons in the production environment. Accidentally instantiating them multiple times in different parts of the application will cause duplicate event subscriptions and memory leaks.

### 3.3 Stable Ordering of Siblings
**Context:** Folders currently contain children (playlists/folders) without an explicit sort order column (other than sidebarPosition for pinned root items).
**Issue:** If users eventually want arbitrary manual ordering of children within folders (instead of relying on alphabetical or creation date sorting), the schema will need an explicit sortIndex or position column for sibling groups.
**Action Item:** This is deferred until it becomes an explicit product requirement, but can be addressed by adding an integer position column to the playlists table scoped by parentId.
