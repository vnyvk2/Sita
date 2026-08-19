# 10. Database & Storage Architecture

This document provides a comprehensive technical specification of Nora's **Relational Persistence Tier**, covering Drizzle ORM schema definitions (24+ tables), indexing strategies, cascade integrity rules, and database transaction lifecycles.

---

## 1. Relational Schema Entity Map (ERD)

The relational schema ([`src/main/db/schema.ts`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/db/schema.ts)) models music entities, derived caches, user preferences, and operational journals:

```mermaid
erDiagram
    music_folders ||--o{ music_folders : "parent/child"
    music_folders ||--o{ songs : "contains"
    
    songs ||--o{ artists_songs : "has"
    artists ||--o{ artists_songs : "performs"
    
    songs ||--o{ album_songs : "belongs_to"
    albums ||--o{ album_songs : "groups"
    
    songs ||--o{ genres_songs : "categorized_by"
    genres ||--o{ genres_songs : "classifies"
    
    songs ||--o{ artworks_songs : "displays"
    artworks ||--o{ artworks_songs : "attached_to"
    
    artworks ||--o| palettes : "generates"
    palettes ||--o{ palette_swatches : "contains"
    
    albums ||--o{ albums_artists : "credits"
    artists ||--o{ albums_artists : "releases"
    
    albums ||--o{ albums_artworks : "featured_in"
    artworks ||--o{ albums_artworks : "illustrates"
    
    playlists ||--o{ playlist_entries : "contains"
    songs ||--o{ playlist_entries : "included_in"
    
    playlists ||--o| smart_playlist_rules : "defined_by"
    playlists ||--o{ playlists : "parent/child"
    
    songs ||--o{ play_events : "logged_in"
    songs ||--o{ seek_events : "tracks"
    songs ||--o{ skip_events : "monitors"
    songs ||--o{ play_history : "records"
    
    songs ||--o| waveforms : "visualized_as"
    songs ||--o| lyrics : "displays"
    songs ||--o| replay_gain : "normalized_by"
    
    songs ||--o{ scrobble_queue : "scrobbles"
    songs ||--o{ metadata_overrides : "overrides"
    
    playlists ||--o{ operation_journal : "journals"
```

---

## 2. Detailed Process Breakdown

### Process 1: Many-to-Many Junctions & Cascade Rules
Ensures data integrity across many-to-many relationships using strict foreign key cascade rules.

**Cascade Invariant Matrix**:
- When a `song` is deleted: All associated junction records (`artworks_songs`, `artists_songs`, `album_songs`, `genres_songs`, `playlist_entries`, `play_history`) automatically delete via `ON DELETE CASCADE`.
- When an `artwork` is deleted: Associated `palettes` and `palette_swatches` delete via `ON DELETE CASCADE`.
- When a `music_folder` is deleted: `songs.folderId` is safely updated to `NULL` via `ON DELETE SET NULL`.

```mermaid
flowchart TD
    DeleteSong([DELETE FROM songs WHERE id = ?]) --> CascadeJunctions{Trigger Database Cascades}
    CascadeJunctions --> DelArtSong[DELETE artworks_songs]
    CascadeJunctions --> DelArtArtist[DELETE artists_songs]
    CascadeJunctions --> DelAlbSong[DELETE album_songs]
    CascadeJunctions --> DelGenSong[DELETE genres_songs]
    CascadeJunctions --> DelPLEntries[DELETE playlist_entries]
    CascadeJunctions --> DelHist[DELETE play_history, play_events, skip_events]
    CascadeJunctions --> DelDerived[DELETE waveforms, lyrics, replay_gain]

    DelArtSong --> CheckOrphans[Process Orphan Pruning for Artists & Albums]
    DelArtArtist --> CheckOrphans
    DelAlbSong --> CheckOrphans
    DelGenSong --> CheckOrphans
    DelPLEntries --> CheckOrphans
    DelHist --> CheckOrphans
    DelDerived --> CheckOrphans
    CheckOrphans --> DeleteDone([Cascade Integrity Guaranteed])

    style CascadeJunctions fill:#f8cecc,stroke:#b85450
    style DeleteDone fill:#d5e8d4,stroke:#82b366
```

---

### Process 2: Index Optimization Strategy
Maintains optimized indices across three distinct query patterns:

1. **Case-Insensitive Exact Lookups**: Generated `citext` columns with B-Tree indices (`idx_songs_title_ci`, `idx_artists_name_ci`, `idx_albums_title_ci`).
2. **Fuzzy Trigram Searches**: PostgreSQL `pg_trgm` GIN operators (`idx_songs_title_ci_trgm`, `idx_artists_name_ci_trgm`).
3. **Composite Sorting Patterns**: Multi-column indices covering compound UI sort orders:
   - `idx_songs_year_title` on `(year ASC, title ASC)`
   - `idx_songs_track_title` on `(track_number ASC, title ASC)`
   - `idx_songs_created_title` on `(created_at DESC, title ASC)`
   - `idx_playlist_entries_playlist_position` on `(playlist_id, position ASC)`

```mermaid
flowchart TD
    Query([Incoming SQL Query]) --> ClassifyQuery{Query Pattern?}
    ClassifyQuery -->|Fuzzy Search| UseGIN[Use GIN Trigram Index: op 'gin_trgm_ops']
    ClassifyQuery -->|Exact Case-Insensitive| UseCI[Use citext B-Tree Index: idx_entity_name_ci]
    ClassifyQuery -->|Ordered List| UseComposite[Use Composite Index: idx_songs_sort_title]
    ClassifyQuery -->|Playlist Sequence| UsePosition[Use idx_playlist_entries_playlist_position]

    UseGIN --> FastExec[Fast Index Scan < 5ms]
    UseCI --> FastExec
    UseComposite --> FastExec
    UsePosition --> FastExec

    style FastExec fill:#d5e8d4,stroke:#82b366
```

---

### Process 3: Short ACID Database Transactions
All database transactions follow Rule 10: **CPU-intensive and filesystem operations are performed strictly OUTSIDE transactions**.

```mermaid
sequenceDiagram
    autonumber
    participant App as Application Service
    participant Disk as Physical Filesystem / TagLib / Sharp
    participant DB as SQLite Transaction Runner

    Note over App,Disk: Phase 1: Heavy I/O outside transaction
    App->>Disk: Read ID3 tags / Resize Image / Compute Hashes
    Disk-->>App: Extracted Buffers & Payloads

    Note over App,DB: Phase 2: Short, atomic ACID transaction (< 10ms)
    App->>DB: BEGIN TRANSACTION
    App->>DB: INSERT / UPDATE entity records & junctions
    App->>DB: COMMIT TRANSACTION
    DB-->>App: Success

    Note over App,Disk: Phase 3: Post-commit event notifications
    App->>App: Emit Domain Events to EventBus
```

---

### Process 4: Derived Asset Caching & Versioned Schema
Derived assets (`artworks`, `palettes`, `waveforms`, `lyrics`, `replay_gain`) track an integer `generatorVersion` column. If generator algorithms evolve (e.g. Palette Generator V2), obsolete caches are detected and regenerated automatically without database migration scripts.

```mermaid
flowchart TD
    CheckAsset([Load Derived Asset]) --> CompareVer{stored generator_version == ENGINE_VERSION?}
    CompareVer -->|Equal| UseAsset[Serve Cached Asset Immediately]
    CompareVer -->|Outdated / Missing| EnqueueRegen[Enqueue Background Regeneration Job]
    EnqueueRegen --> ServePlaceholder[Serve Placeholder Gracefully]
    EnqueueRegen --> RunJob[JobScheduler executes generator]
    RunJob --> UpdateAssetDB[UPDATE asset SET generator_version = ENGINE_VERSION]
    UpdateAssetDB --> EmitReady[Emit AssetReady Event]

    style UseAsset fill:#d5e8d4,stroke:#82b366
    style EnqueueRegen fill:#ffe6cc,stroke:#d79b00
```

---

### Process 5: User Preferences & State Serialization
Stores application settings, custom keyboard shortcuts, equalizer presets, and mini player geometry in structured tables:

- **`user_settings`**: Global app settings, Last.fm session keys, metadata preferences, library scan modes.
- **`user_keyboard_shortcuts`**: Key-value mapping of custom shortcut keys.
- **`user_equalizer_preset`**: Frequency band arrays and preset names.
- **`metadata_overrides`**: User-defined field overrides (`entityKind`, `entityId`, `fieldId`, `stringValue`).
- **`collection_contexts`**: Serialized UI states per collection URI.

```mermaid
flowchart TD
    PrefAction([Read / Save User Preferences]) --> TargetTable{Preference Type?}
    TargetTable -->|App Settings| SettingsRow[user_settings Table]
    TargetTable -->|Shortcuts| ShortcutsRow[user_keyboard_shortcuts Table]
    TargetTable -->|EQ Preset| EQRow[user_equalizer_preset Table]
    TargetTable -->|Tag Overrides| OverrideRow[metadata_overrides Table]
    TargetTable -->|UI State| ContextRow[collection_contexts Table]

    SettingsRow --> PersistDB[(Drizzle SQLite Commit)]
    ShortcutsRow --> PersistDB
    EQRow --> PersistDB
    OverrideRow --> PersistDB
    ContextRow --> PersistDB

    style PersistDB fill:#fff2cc,stroke:#d6b656
```

---

## 3. Multi-Process Persistence Choreography Graph

The following composite flowchart illustrates the relationship between raw database operations and domain events:

```mermaid
graph TD
    IngestSong[Library Reconciler Ingests Track] --> ShortTx[Process 3: Short ACID DB Transaction]
    ShortTx --> InsertRecords[INSERT INTO songs, artists_songs, album_songs]
    InsertRecords --> CascadeProtection[Process 1: Enforce Foreign Key Cascades]
    CascadeProtection --> IndexOptimize[Process 2: Auto-Update Trigram & Sort Indexes]
    IndexOptimize --> DBCommit[(Database Commit)]
    DBCommit --> TriggerAssets[Process 4: Enqueue Derived Asset Generation]
    TriggerAssets --> WriteAssets[INSERT INTO artworks, palettes, waveforms]
    WriteAssets --> CheckVersion[Validate generatorVersion Consistency]

    style ShortTx fill:#dae8fc,stroke:#6c8ebf
    style DBCommit fill:#d5e8d4,stroke:#82b366
    style WriteAssets fill:#ffe6cc,stroke:#d79b00
```
