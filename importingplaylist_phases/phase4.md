# Phase 4 — Library Resolution Engine

## Objective
Implement the **Library Resolution Engine**, responsible for matching resolved/verified playlist entries against Nora's music library without performing any database writes or playlist creation.

## Architecture
```text
Playlist File
      │
      ▼
M3UImporter
      │
      ▼
ImportedPlaylist
      │
      ▼
PlaylistPathResolver
      │
      ▼
ResolvedPlaylist
      │
      ▼
FilesystemVerifier
      │
      ▼
VerifiedPlaylist
      │
      ▼
LibraryResolver (via LibraryLookup abstraction)
      │
      ▼
LibraryResolvedPlaylist
```

## Features & Components
1. **`LibraryLookup` Abstraction**:
   - `LibraryLookup` interface with `findByCanonicalPath(path: string): Promise<LibrarySongRecord | null>`.
   - `DrizzleLibraryLookup`: Concrete implementation querying the `songs` table in Drizzle DB by exact path.

2. **`LibraryResolver`**:
   - Matches verified entries against the library by exact canonical path.
   - Assigns resolution status:
     - `MATCHED` (Exact canonical path found in DB, confidence = 100).
     - `NOT_IN_LIBRARY` (File exists on filesystem, but DB has no song record).
     - `MISSING` (Filesystem reports missing).
     - `UNRESOLVED` (Non-filesystem URI).
     - `INVALID_URI` (Malformed URI).

3. **Resolution Models**:
   - `LibraryMatch`, `LibraryResolvedTrackReference`, `LibraryResolvedPlaylistEntry`, `LibraryResolvedPlaylist`.
   - Complete immutability: Previous model stages (`ImportedPlaylist`, `ResolvedPlaylist`) are preserved wrapped inside downstream references.

4. **Side-effect Free**:
   - Read-only library queries. No database mutations, no playlist entity creation, no IPC/UI side-effects.
