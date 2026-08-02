# Phase 16 — Plugin & Extension Framework

## Objective
Introduce a **Plugin & Extension Subsystem** (`src/main/playlistPlugin/`) that turns Nora into an open, extensible platform. External platforms (Spotify, YouTube Music, Plex, Jellyfin, MusicBrainz, Discogs) and custom algorithms can be integrated via sandboxed plugin capabilities without modifying the core codebase.

This phase does not modify any Phase 1–15 core execution code.

## Architecture
```text
External Plugins (Spotify, YouTube, Plex, MusicBrainz)
        │
        ▼
PluginManager (Discovery, Validation, Sandboxed Lifecycle & Activation)
        │
        ├── PluginContext (Sandboxed API: EventBus, Logger, Memory Store)
        ├── PluginRegistry (Provider Registries: Import, Match, Sync, Metadata, Automation, Observability)
        └── PlaylistPlugin (Plugin Lifecycle Interface: activate / deactivate)
        │
        ▼
Core Nora Platform (Phase 1–15 Importers, Matchers, Sync Engine & Observability)
```

## Features & Components
1. **Domain Models**:
   - `PluginCapability`: `'IMPORT_PROVIDER' | 'MATCH_PROVIDER' | 'SYNC_PROVIDER' | 'METADATA_PROVIDER' | 'AUTOMATION_TRIGGER' | 'OBSERVABILITY_PROVIDER' | 'EXPORT_PROVIDER'`.
   - `PlaylistPluginManifest`: `id`, `name`, `version`, `description`, `minimumApiVersion`, `capabilities`.
   - `PluginStatus`: `'DISCOVERED' | 'VALIDATED' | 'RUNNING' | 'DISABLED' | 'FAILED'`.
   - `PluginInfo`: `manifest`, `status`, `loadedAt`, `error`.

2. **Sandboxed Context & Interface**:
   - `PluginContext`: Exposes event bus subscription, isolated logging, and memory store without exposing database or system internals.
   - `PlaylistPlugin`: Plugin contract interface (`activate`, `deactivate`).

3. **Registries & Manager**:
   - `PluginRegistry`: Capability provider router.
   - `PluginManager`: Lifecycle manager (`registerPlugin`, `activatePlugin`, `deactivatePlugin`, `enablePlugin`, `disablePlugin`).

4. **IPC Setup**:
   - Registers `plugin:list`, `plugin:enable`, `plugin:disable`, `plugin:reload`, and `plugin:capabilities` endpoints.
