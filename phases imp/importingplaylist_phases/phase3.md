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
PlaylistPathResolver (Pure path calculation)
      │
      ▼
FilesystemVerifier (Disk verification via FileSystemAccess)
      │
      ▼
ResolvedPlaylist
```

## Features & Components
1. **`PlaylistPathResolver` (Pure Path Calculation)**:
   - Converts `file:///` URIs to native filesystem paths (`file:///C:/Music/Song.mp3` -> `C:\Music\Song.mp3`).
   - Resolves relative paths (`..\Music\Song.mp3`, `./Song.mp3`, `Music/Song.mp3`) using the playlist file's directory as the base.
   - Preserves absolute paths (`C:\Music\Song.mp3`, `/home/user/music/song.mp3`).
   - Marks non-filesystem URIs (e.g. `spotify:track:...`, `http://...`) as `UNRESOLVED`.
   - Normalizes path separators without altering filename casing or Unicode.

2. **`FilesystemVerifier` & `FileSystemAccess`**:
   - `FileSystemAccess`: Abstraction interface for disk checking (`exists(path)`).
   - `FilesystemVerifier`: Async layer that verifies if resolved paths exist on disk, updating status from `RESOLVED` to `MISSING` if absent.

3. **Models**:
   - `PathResolutionResult` (`status: 'RESOLVED' | 'UNRESOLVED' | 'MISSING' | 'INVALID_URI'`).
   - `ResolvedTrackReference`, `ResolvedPlaylistEntry`, `ResolvedPlaylist`.
   - Immutability preserved (`ImportedPlaylist` is never mutated).
