# Phase 3 — Playlist Path Resolution Engine

## Objective
Implement a pure filesystem path resolution layer that transforms imported track references (`ImportedPlaylist`) into canonical resolved locations (`ResolvedPlaylist`).

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
```

## Features & Behaviors
1. **Resolution Pipeline**:
   - Converts `file:///` URIs to native filesystem paths (`file:///C:/Music/Song.mp3` -> `C:\Music\Song.mp3` or `/Music/Song.mp3`).
   - Resolves relative paths (`..\Music\Song.mp3`, `./Song.mp3`, `Music/Song.mp3`) using the playlist file's directory as the base.
   - Preserves absolute paths (`C:\Music\Song.mp3`, `/home/user/music/song.mp3`) untouched.
   - Normalizes path separators without altering filename casing or Unicode normalization.
2. **Filesystem Existence Checking**:
   - Checks if the resolved target path exists on the filesystem (`stat` / `access`).
   - Assigns status: `'FOUND'` | `'MISSING'` | `'INVALID_URI'`.
3. **Immutability & Diagnostics**:
   - `ImportedPlaylist` remains untouched.
   - Produces `ResolvedPlaylist`, `ResolvedPlaylistEntry`, `ResolvedTrackReference`, and `PathResolutionResult`.
   - Stores `originalReference` and `resolvedPath`.
4. **Side-effect Free**:
   - No music database queries, no song metadata matching, no UI, no IPC.
