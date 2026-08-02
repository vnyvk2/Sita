# Phase 2 — M3U / M3U8 Parser

## Objective
Implement the first concrete playlist importer (`M3UImporter`) supporting standard M3U and M3U8 files.

## Architecture
```text
Playlist File
      │
      ▼
PlaylistImportService
      │
      ▼
PlaylistImporterRegistry
      │
      ▼
M3UImporter (State Machine)
      │
      ▼
PlaylistImportResult
```

## Scope & Behavior
1. **Parser State Machine**: Line-by-line streaming/iteration over UTF-8 text (stripping BOM `\uFEFF`).
2. **Standard & Extended M3U**:
   - Parses `#EXTM3U` headers.
   - Parses `#EXTINF:<duration>,<Artist - Title>` or `#EXTINF:<duration>,<Title>` into `ImportedTrackReference` metadata (`title`, `artist`, `duration`).
3. **Paths & Positions**:
   - Preserves raw relative or absolute paths without normalization, canonicalization, or file existence checks.
   - Assigns 1-based sequential `position` to every track entry.
4. **Resilience & Pure Translation**:
   - Ignores standard comments (`#...`) and unknown `#EXT` directives.
   - Pure function returning `PlaylistImportResult` without DB, IPC, or UI side-effects.
