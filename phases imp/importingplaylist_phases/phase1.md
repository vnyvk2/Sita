# Phase 1 — Playlist Import Infrastructure

## Objective
Build the generic, format-agnostic playlist import infrastructure contracts and registry.

## Components Created
- `src/main/playlistImport/models/ImportedTrackReference.ts`
- `src/main/playlistImport/models/ImportedPlaylistEntry.ts`
- `src/main/playlistImport/models/ImportedPlaylist.ts`
- `src/main/playlistImport/models/PlaylistImportResult.ts`
- `src/main/playlistImport/models/PlaylistImportWarning.ts`
- `src/main/playlistImport/interfaces/PlaylistImportContext.ts`
- `src/main/playlistImport/interfaces/PlaylistImporter.ts`
- `src/main/playlistImport/errors/PlaylistImportError.ts`
- `src/main/playlistImport/registry/PlaylistImporterRegistry.ts`
- `src/main/playlistImport/services/PlaylistImportService.ts`
- `src/main/playlistImport/constants/PlaylistFormats.ts`

## Key Architecture Contracts
- **`PlaylistImporter`**: Interface defining `id`, `name`, `supportedExtensions`, `supportedMimeTypes`, and `parse(context: PlaylistImportContext): Promise<PlaylistImportResult>`.
- **`PlaylistImporterRegistry`**: Registers and resolves importers by extension, MIME type, or ID.
- **`PlaylistImportService`**: Orchestrates import requests, resolves importers by extension, and passes `PlaylistImportContext`.
- **Side-effect Free**: Zero database mutations, zero UI side-effects, zero parsing logic in Phase 1.
