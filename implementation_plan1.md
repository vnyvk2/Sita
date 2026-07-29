# Nora Collection Platform — Architecture Design

## 1. Problem Statement

Nora's current playlist system has fundamental architectural limitations that prevent it from reaching MusicBee-level quality:

| Limitation | Impact |
|:---|:---|
| `playlists_songs` is a simple `[playlistId, songId]` composite-key junction table | No manual ordering, no duplicate songs, no per-entry metadata |
| Each playlist operation (`addSongsToPlaylist.ts`, `removeSongFromPlaylist.ts`, `renameAPlaylist.ts`, `removePlaylists.ts`, `exportPlaylist.ts`, `importPlaylist.ts`) lives in its own file with no shared transactional framework | Operations cannot be composed, undone, or batched |
| Albums, Artists, Playlists, Folders, Genres, Favorites, History all have completely separate UI pages, query patterns, and data converters | ~90% duplicated logic across `convertToPlaylist`, `convertToAlbum`, `convertToArtist`, `convertToGenre` |
| No dynamic/rule-based playlist generation | Cannot compete with MusicBee's AutoPlaylists or Roon's Smart Focus |
| Sidebar is a hardcoded list of 9 `linkOptions` entries | Users cannot pin albums, playlists, or smart lists to the sidebar |
| Favorites is a `songs.isFavorite` boolean field, History is a `play_history` table — both pretend to be playlists via `SpecialPlaylists` enum (`-1`, `-2`) | Special-case code leaks everywhere (`exportPlaylist.ts` has explicit `if/else if` for each) |
| No undo/redo for any mutation | One misclick deletes a curated playlist permanently |

This design addresses all of these by introducing a **Collection Platform** — a unified abstraction layer that treats all song-groupings (Playlists, Albums, Artists, Folders, Genres, Search Results, Queue, Smart Lists) as typed views over a common rendering pipeline.

---

## 2. Core Domain Model

### 2.1 Collection — The Presentation Abstraction

A `Collection` is **not** a domain model. It is a view-model that the UI receives. Real domain objects (Albums, Playlists, Folders) remain as separate database entities. The `Collection` is what the renderer consumes.

```typescript
// src/common/collections/types.ts

// ─── Universal Collection Identity ───────────────────────────
interface CollectionId {
  /** Where this collection originates */
  source: 'local' | 'search' | 'queue' | 'generated';
  /** The domain type backing this collection */
  type: CollectionType;
  /** The domain-specific primary key (e.g., albumId, playlistId) */
  id: number | string;
}
// Serialized form: "local://playlist/52" or "search://results/current"

type CollectionType =
  | 'playlist'
  | 'smartPlaylist'
  | 'album'
  | 'artist'
  | 'genre'
  | 'folder'
  | 'favorites'
  | 'history'
  | 'queue'
  | 'search';

// ─── Capabilities ────────────────────────────────────────────
interface CollectionCapabilities {
  canRename: boolean;
  canDelete: boolean;
  canReorder: boolean;
  canAddSongs: boolean;
  canRemoveSongs: boolean;
  canExport: boolean;
  canImport: boolean;
  canPin: boolean;
  supportsUndo: boolean;
  supportsDragDrop: boolean;
  supportsRules: boolean;       // Smart Playlists only
  supportsHierarchy: boolean;   // Nested folders
}

// ─── Collection State ────────────────────────────────────────
type CollectionState =
  | 'loading'
  | 'ready'
  | 'refreshing'
  | 'building'     // Smart Playlist being generated
  | 'invalidated'
  | 'failed'
  | 'empty';

// ─── The Collection View (Metadata & Descriptor) ───────────────────
interface Collection {
  id: CollectionId;
  title: string;
  description?: string;
  icon: string;
  state: CollectionState;
  capabilities: CollectionCapabilities;

  // Presentation data
  artworkPaths: ArtworkPaths;
  paletteData?: PaletteData;

  // Statistics (computed incrementally/lazily)
  stats: CollectionStats;

  /**
   * Optional initial slice or preview entries.
   * Full entry retrieval MUST use the paginated getEntries() API to maintain O(1) memory for 50k+ track collections.
   */
  entries?: CollectionEntry[];

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

interface CollectionStats {
  totalEntries: number;
  totalDuration: number;    // seconds
  uniqueArtists: number;
  uniqueAlbums: number;
}

interface CollectionEntry {
  /** Entry-level identity (distinct from songId) */
  entryId: number | string;
  /** The underlying song data */
  song: SongData;
  /** Position within the collection (for ordered collections) */
  position: number;
  /** When this entry was added */
  addedAt: Date;
}
```

> [!IMPORTANT]
> **Metadata vs. Entries Separation:** `getCollection(id)` fetches strictly `Collection` metadata, stats, and capabilities (lightweight O(1) memory payload). Entry arrays for rendering are fetched independently in paginated chunks via `getEntries(id, start, end)`. This ensures that even 100,000-song playlists load instantly without serializing massive arrays over IPC.


### 2.2 Why `Collection` Is a View, Not a Domain Model

Trying to force Albums and Folders into a single domain object eventually creates hundreds of nullable fields. By keeping the internal domain model (the database tables) separate from the external view abstraction (`Collection`), we:

- Keep the data layer clean and normalized
- Give the UI exactly one shape to render, regardless of source
- Prevent the "God Object" anti-pattern
- Allow adding new collection types (e.g., Spotify playlists) without touching UI code

```
┌─────────────────────────────────────────────────────────────┐
│                         UI Layer                            │
│   Renders Collection objects — never checks domain type     │
│   Uses capabilities for conditional UI (rename, reorder)    │
└───────────────────────────┬─────────────────────────────────┘
                            │ Collection
┌───────────────────────────┴─────────────────────────────────┐
│                   Collection Resolver                       │
│   Routes CollectionId → correct Provider via Registry       │
└───────────────────────────┬─────────────────────────────────┘
                            │
    ┌──────────┬────────────┼────────────┬────────────┐
    │          │            │            │            │
 Playlist   Album       Artist      Folder      SmartList
 Provider   Provider    Provider    Provider    Provider
    │          │            │            │            │
 Playlist   Album       Artist      Folder      Query
 Service    Service     Service     Service     Engine
    │          │            │            │            │
 playlist   albums      artists     music_      smart_
 _entries   (table)     (table)     folders     playlist
 (table)                            (table)     _rules
```

---

## 3. Database Schema Changes

### 3.1 New: `playlist_entries` Table (Replaces `playlists_songs`)

This is the single most critical schema change. The current `playlists_songs` junction table uses a `[playlistId, songId]` composite primary key — this means:
- A song can only appear **once** per playlist
- There is no explicit ordering
- There is no per-entry metadata

> [!NOTE]
> Advanced per-entry metadata (custom tags, rating overrides) is **deferred to a later phase**. Phase 1 focuses on Entry Identity, ordering, and transactions.

```typescript
// src/main/db/schema.ts — NEW TABLE

export const playlistEntries = pgTable(
  'playlist_entries',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    playlistId: integer('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    songId: integer('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    /** Explicit ordering. Allows manual reorder + duplicate songs. */
    position: integer('position').notNull(),
    addedAt: timestamp('added_at', { withTimezone: false }).defaultNow().notNull(),
    /** Optional: who or what added this entry */
    source: varchar('source', { length: 50 }).default('manual'),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull()
  },
  (t) => [
    index('idx_playlist_entries_playlist_id').on(t.playlistId),
    index('idx_playlist_entries_song_id').on(t.songId),
    // Critical: enables ORDER BY position queries within a playlist
    index('idx_playlist_entries_playlist_position').on(t.playlistId, t.position.asc()),
    index('idx_playlist_entries_added_at').on(t.addedAt.desc())
  ]
);

export const playlistEntriesRelations = relations(playlistEntries, ({ one }) => ({
  playlist: one(playlists, {
    fields: [playlistEntries.playlistId],
    references: [playlists.id]
  }),
  song: one(songs, {
    fields: [playlistEntries.songId],
    references: [songs.id]
  })
}));
```

### 3.2 New: `playlists` Table Enhancements

```typescript
// src/main/db/schema.ts — MODIFY playlists table

export const playlists = pgTable(
  'playlists',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    name: varchar('name', { length: 255 }).notNull(),
    nameCI: citext('name_ci').generatedAlwaysAs((): SQL => sql`${playlists.name}::citext`),
    description: text('description'),
    /** For nested playlist folders */
    parentId: integer('parent_id').references((): AnyPgColumn => playlists.id, {
      onDelete: 'set null',
      onUpdate: 'cascade'
    }),
    /** Discriminates standard vs smart vs folder-type playlists */
    playlistType: varchar('playlist_type', { length: 20 })
      .notNull()
      .default('standard'), // 'standard' | 'smart' | 'folder'
    /** Denormalized counters for instant UI paints */
    itemCount: integer('item_count').notNull().default(0),
    totalDuration: decimal('total_duration', { precision: 12, scale: 3 }).notNull().default('0'),
    /** Sidebar pin ordering (null = not pinned) */
    sidebarPosition: integer('sidebar_position'),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull()
  },
  (t) => [
    index('idx_playlists_name').on(t.name.asc()),
    index('idx_playlists_name_ci').on(t.nameCI.asc()),
    index('idx_playlists_name_ci_trgm').using('gin', t.nameCI.op('gin_trgm_ops')),
    index('idx_playlists_created_at').on(t.createdAt.desc()),
    index('idx_playlists_parent_id').on(t.parentId),
    index('idx_playlists_type').on(t.playlistType),
    index('idx_playlists_sidebar').on(t.sidebarPosition.asc())
  ]
);
```

### 3.3 New: `smart_playlist_rules` Table

```typescript
// src/main/db/schema.ts — NEW TABLE

export const smartPlaylistRules = pgTable(
  'smart_playlist_rules',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    playlistId: integer('playlist_id')
      .notNull()
      .unique()
      .references(() => playlists.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    /** The rule AST stored as JSON */
    ruleAst: json('rule_ast').$type<SmartPlaylistRuleAST>().notNull(),
    /** Version of the rule schema — for forward-compatible deserialization */
    ruleVersion: integer('rule_version').notNull().default(1),
    /** Maximum entries the smart playlist should contain (null = unlimited) */
    maxEntries: integer('max_entries'),
    /** Sort order for the generated results */
    sortDefinition: json('sort_definition').$type<SortDefinition[]>(),
    /** When the playlist was last regenerated */
    lastGeneratedAt: timestamp('last_generated_at', { withTimezone: false }),
    /** Hash of the rule AST — used to detect if regeneration is needed */
    ruleHash: varchar('rule_hash', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull()
  },
  (t) => [
    index('idx_smart_playlist_rules_playlist_id').on(t.playlistId)
  ]
);
```

### 3.4 New: `operation_journal` Table (Replaces raw snapshots)

The undo system uses an **Operation Journal** rather than raw snapshots. Snapshots are one implementation detail of the journal. This abstraction is future-proof — later, undo, redo, merge, cloud sync, and conflict resolution all become natural extensions of the same journal.

> [!NOTE]
> This is still strictly relational. Not event sourcing. The journal records operation metadata and state snapshots, not individual field-level mutations.

```typescript
// src/main/db/schema.ts — NEW TABLE

export const operationJournal = pgTable(
  'operation_journal',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    /** Which collection this operation targeted */
    collectionType: varchar('collection_type', { length: 20 }).notNull(),
    collectionId: integer('collection_id').notNull(),
    /** What operation was performed */
    operationType: varchar('operation_type', { length: 50 }).notNull(),
    /** Direction: 'forward' for original, 'reverse' for undo */
    direction: varchar('direction', { length: 10 }).notNull().default('forward'),
    /** The forward operation input (what was requested) */
    operationInput: json('operation_input').$type<Record<string, unknown>>().notNull(),
    /** The reverse operation data (what's needed to undo) */
    reverseData: json('reverse_data').$type<OperationReverseData>().notNull(),
    /** Position in the journal stack (for redo ordering) */
    sequenceNumber: integer('sequence_number').notNull(),
    /** Auto-expires old entries */
    expiresAt: timestamp('expires_at', { withTimezone: false }),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull()
  },
  (t) => [
    index('idx_journal_collection').on(t.collectionType, t.collectionId),
    index('idx_journal_sequence').on(t.sequenceNumber.desc()),
    index('idx_journal_expires').on(t.expiresAt.asc())
  ]
);

// Typed reverse data — not Record<string, any>
type OperationReverseData =
  | { type: 'entries_snapshot'; entries: Array<{ songId: number; position: number }> }
  | { type: 'name_snapshot'; previousName: string }
  | { type: 'full_snapshot'; data: Record<string, unknown> };
```

### 3.5 New: `collection_contexts` Table

Persists per-collection UI state so that the user never loses their view configuration when navigating away and back.

```typescript
// src/main/db/schema.ts — NEW TABLE

export const collectionContexts = pgTable(
  'collection_contexts',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    /** Serialized CollectionId (e.g., "local://playlist/52") */
    collectionUri: varchar('collection_uri', { length: 255 }).notNull().unique(),
    /** Persisted UI state */
    contextData: json('context_data').$type<CollectionContextData>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull()
  },
  (t) => [
    index('idx_collection_contexts_uri').on(t.collectionUri)
  ]
);
```

---

## 4. Collection Registry

The Registry is the platform hub. When a new collection type is added, it registers its descriptor once. The rest of the application (sidebar, routing, context menus, search) discovers it automatically.

```typescript
// src/main/collections/registry.ts

interface CollectionDescriptor {
  type: CollectionType;
  displayName: string;
  icon: string;
  capabilities: CollectionCapabilities;
  provider: CollectionProvider;
  /** Provider-declared generation cost for scheduler prioritization */
  cost: ProviderCost;
  route: string;
}

type ProviderCost = 'cheap' | 'medium' | 'expensive';

// Capability presets for each known type
const CAPABILITY_PRESETS: Record<CollectionType, CollectionCapabilities> = {
  playlist: {
    canRename: true, canDelete: true, canReorder: true,
    canAddSongs: true, canRemoveSongs: true, canExport: true,
    canImport: true, canPin: true, supportsUndo: true,
    supportsDragDrop: true, supportsRules: false, supportsHierarchy: true
  },
  album: {
    canRename: false, canDelete: false, canReorder: false,
    canAddSongs: false, canRemoveSongs: false, canExport: true,
    canImport: false, canPin: true, supportsUndo: false,
    supportsDragDrop: false, supportsRules: false, supportsHierarchy: false
  },
  smartPlaylist: {
    canRename: true, canDelete: true, canReorder: false,
    canAddSongs: false, canRemoveSongs: false, canExport: true,
    canImport: false, canPin: true, supportsUndo: false,
    supportsDragDrop: false, supportsRules: true, supportsHierarchy: true
  },
  favorites: {
    canRename: false, canDelete: false, canReorder: false,
    canAddSongs: true, canRemoveSongs: true, canExport: true,
    canImport: true, canPin: false, supportsUndo: true,
    supportsDragDrop: false, supportsRules: false, supportsHierarchy: false
  },
  history: {
    canRename: false, canDelete: false, canReorder: false,
    canAddSongs: false, canRemoveSongs: false, canExport: true,
    canImport: false, canPin: false, supportsUndo: false,
    supportsDragDrop: false, supportsRules: false, supportsHierarchy: false
  },
  artist: {
    canRename: false, canDelete: false, canReorder: false,
    canAddSongs: false, canRemoveSongs: false, canExport: true,
    canImport: false, canPin: true, supportsUndo: false,
    supportsDragDrop: false, supportsRules: false, supportsHierarchy: false
  },
  genre: {
    canRename: false, canDelete: false, canReorder: false,
    canAddSongs: false, canRemoveSongs: false, canExport: true,
    canImport: false, canPin: true, supportsUndo: false,
    supportsDragDrop: false, supportsRules: false, supportsHierarchy: false
  },
  folder: {
    canRename: false, canDelete: false, canReorder: false,
    canAddSongs: false, canRemoveSongs: false, canExport: true,
    canImport: false, canPin: true, supportsUndo: false,
    supportsDragDrop: false, supportsRules: false, supportsHierarchy: true
  },
  queue: {
    canRename: false, canDelete: false, canReorder: true,
    canAddSongs: true, canRemoveSongs: true, canExport: false,
    canImport: false, canPin: false, supportsUndo: true,
    supportsDragDrop: true, supportsRules: false, supportsHierarchy: false
  },
  search: {
    canRename: false, canDelete: false, canReorder: false,
    canAddSongs: false, canRemoveSongs: false, canExport: false,
    canImport: false, canPin: false, supportsUndo: false,
    supportsDragDrop: false, supportsRules: false, supportsHierarchy: false
  }
};

// Cost declarations — scheduler uses these to prioritize
const PROVIDER_COSTS: Record<CollectionType, ProviderCost> = {
  playlist:      'cheap',
  album:         'cheap',
  artist:        'cheap',
  genre:         'cheap',
  folder:        'cheap',
  favorites:     'cheap',
  history:       'medium',
  queue:         'cheap',
  search:        'medium',
  smartPlaylist: 'expensive'
};
```

---

## 5. Collection Providers

Providers are **read-only translation layers**. They take domain-specific data and convert it into the unified `Collection` view.

```
src/main/collections/
├── registry.ts              # CollectionRegistry class
├── resolver.ts              # Routes CollectionId → Provider
├── types.ts                 # Shared types (CollectionId, etc.)
├── providers/
│   ├── PlaylistProvider.ts  # playlists + playlist_entries → Collection
│   ├── AlbumProvider.ts     # albums + album_songs → Collection
│   ├── ArtistProvider.ts    # artists + artists_songs → Collection
│   ├── GenreProvider.ts     # genres + genres_songs → Collection
│   ├── FolderProvider.ts    # music_folders + songs → Collection
│   ├── FavoritesProvider.ts # songs WHERE is_favorite = true → Collection
│   ├── HistoryProvider.ts   # play_history JOIN songs → Collection
│   ├── QueueProvider.ts     # In-memory queue state → Collection
│   └── SearchProvider.ts    # Search results → Collection
├── engine/
│   ├── PlaylistEngine.ts    # Mutation operations (add, remove, reorder, merge)
│   ├── PlaylistService.ts   # Business rules & validation
│   ├── PlaylistRepository.ts # Raw Drizzle persistence
│   └── QueueEngine.ts       # Queue-specific engine (playback-aware)
├── membership/
│   ├── MembershipService.ts # Song ↔ Collection membership operations
│   └── MembershipCache.ts   # In-memory membership lookup cache
├── operations/
│   ├── types.ts             # CollectionOperation interface
│   ├── AddSongsOp.ts        # Add songs operation
│   ├── RemoveSongsOp.ts     # Remove songs operation
│   ├── ReorderOp.ts         # Reorder entries operation
│   ├── RenameOp.ts          # Rename collection operation
│   ├── MergeOp.ts           # Merge playlists operation
│   ├── DuplicateOp.ts       # Duplicate playlist operation
│   └── OperationJournal.ts  # Journal-based undo/redo
├── pipeline/
│   ├── FilterEngine.ts      # In-memory filtering of collection entries
│   ├── SortEngine.ts        # Multi-level sorting (MusicBee-style)
│   └── GroupEngine.ts       # Grouping by Album → Artist → Year
├── context/
│   ├── CollectionContext.ts  # Per-collection UI state persistence
│   └── ColumnProvider.ts     # Dynamic column definitions
├── view/
│   └── ViewModeRegistry.ts   # View mode definitions (List, Grid, Cards, etc.)
├── query/
│   ├── ast.ts               # Smart Playlist rule AST definition
│   ├── compiler.ts          # AST → Drizzle SQL compiler
│   └── version.ts           # Rule version management
├── relationships/
│   └── RelationshipResolver.ts # Graph traversal between related collections
├── diagnostics/
│   └── CollectionDiagnostics.ts # Diagnostics interface & metrics
└── events/
    └── CollectionEvents.ts  # Typed event definitions
```

### Provider Interface

```typescript
// src/main/collections/providers/types.ts

interface CollectionProvider {
  /** Fetch a single collection by its domain-specific ID */
  getCollection(id: number | string): Promise<Collection>;

  /** Fetch all collections of this type (for listing pages) */
  getAllCollections(options: CollectionQueryOptions): Promise<PaginatedResult<Collection>>;

  /** Get just the entries for a collection (for pagination within a collection) */
  getEntries(
    collectionId: number | string,
    options: EntryQueryOptions
  ): Promise<PaginatedResult<CollectionEntry>>;
}

interface CollectionQueryOptions {
  sortType?: string;
  start?: number;
  end?: number;
  filter?: string;
}

interface EntryQueryOptions {
  start: number;
  end: number;
  sortDefinition?: SortDefinition[];
}
```

### Example: Playlist Provider

```typescript
// src/main/collections/providers/PlaylistProvider.ts

export const PlaylistProvider: CollectionProvider = {
  async getCollection(playlistId: number): Promise<Collection> {
    const playlist = await playlistRepository.getById(playlistId);
    if (!playlist) throw new Error(`Playlist ${playlistId} not found`);

    const entries = await playlistRepository.getEntries(playlistId);

    return {
      id: { source: 'local', type: 'playlist', id: playlistId },
      title: playlist.name,
      description: playlist.description ?? undefined,
      icon: 'queue_music',
      state: 'ready',
      capabilities: CAPABILITY_PRESETS.playlist,
      artworkPaths: parsePlaylistArtworks(playlist.artworks),
      stats: {
        totalEntries: playlist.itemCount,
        totalDuration: Number(playlist.totalDuration),
        uniqueArtists: 0, // computed lazily
        uniqueAlbums: 0
      },
      entries: entries.map((e) => ({
        entryId: e.id,
        song: convertToSongData(e.song),
        position: e.position,
        addedAt: e.addedAt
      })),
      createdAt: playlist.createdAt,
      updatedAt: playlist.updatedAt
    };
  },

  // ... getAllCollections, getEntries
};
```

### Search as Collection Provider

Search is no longer a separate silo. It is just another Collection Provider. Search results flow through the same pipeline as every other collection.

```
User types query
    │
    ▼
SearchCoordinator (existing)
    │
    ▼
SearchProvider.getCollection()
    │
    ▼
Returns Collection { type: 'search', entries: [...matches] }
    │
    ▼
Collection Pipeline (Filter → Sort → Group → View)
    │
    ▼
UI renders via CollectionView — identical to any playlist
```

The existing `SearchCoordinator` and per-entity `SearchEngine`s remain untouched. The `SearchProvider` wraps their results into the `Collection` view abstraction.

---

## 6. Collection Membership System

This is the backbone for context menus and the feature that makes MusicBee's playlist management feel so natural.

```
Right Click on Song
    │
    ▼
Playlist Membership
    │
    ├── ✓ Workout       (song is in this playlist)
    ├── ✓ Favorites      (song.isFavorite = true)
    ├── □ Jazz            (song is NOT in this playlist)
    └── ─ Chill Vibes     (some selected songs are in, some aren't → tri-state)
```

### MembershipService

```typescript
// src/main/collections/membership/MembershipService.ts

interface MembershipService {
  /** Get all collections that contain a specific song */
  getCollectionsForSong(songId: number): Promise<CollectionMembership[]>;

  /** Get all collections for MULTIPLE songs (for multi-select context menus) */
  getCollectionsForSongs(songIds: number[]): Promise<BatchMembership>;

  /** Add a song to a collection (routes through Engine) */
  addToCollection(songId: number, collectionId: CollectionId): Promise<void>;

  /** Remove a song from a collection (routes through Engine) */
  removeFromCollection(songId: number, collectionId: CollectionId): Promise<void>;

  /** Batch: add/remove multiple songs to/from multiple collections */
  batchUpdate(operations: MembershipOperation[]): Promise<void>;
}

interface CollectionMembership {
  collectionId: CollectionId;
  collectionName: string;
  isMember: boolean;
}

/** For multi-select: shows tri-state membership */
interface BatchMembership {
  collections: Array<{
    collectionId: CollectionId;
    collectionName: string;
    /** 'all' = all selected songs are members, 'some' = partial, 'none' = none */
    membershipState: 'all' | 'some' | 'none';
  }>;
}

interface MembershipOperation {
  action: 'add' | 'remove';
  songId: number;
  collectionId: CollectionId;
}
```

### Membership Cache

For responsiveness, the `MembershipCache` maintains an in-memory reverse index: `songId → Set<CollectionId>`. This cache is invalidated by `collection:entriesAdded` and `collection:entriesRemoved` events.

```typescript
// src/main/collections/membership/MembershipCache.ts

class MembershipCache {
  /** songId → set of collection URIs this song belongs to */
  private index: Map<number, Set<string>> = new Map();

  /** Warm the cache from the database at startup */
  async warm(): Promise<void>;

  /** O(1) lookup: which collections contain this song? */
  getCollectionsForSong(songId: number): Set<string>;

  /** Invalidate specific entries when membership changes */
  invalidate(songId: number, collectionUri: string): void;
}
```

### Features Enabled by Membership

- **Add to Playlist** (context menu)
- **Remove from Playlist** (context menu)
- **Show Playlist Membership** (checkmarks in menu)
- **Tri-state menus** for multi-select
- **"Open Playlist Containing Song"** navigation
- **Batch membership** operations
- **Playlist statistics** ("This song appears in 5 playlists")

---

## 7. Playlist Engine — Layered Mutation Architecture

```
┌─────────────────────────────────────────────┐
│              IPC Handler                     │
│  Receives: 'collection/addSongs'            │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│           PlaylistEngine                     │
│  Opens operation context                     │
│  Writes to Operation Journal                 │
│  Executes within DB transaction              │
│  Emits collection event                      │
│  Updates denormalized counters               │
│  Invalidates MembershipCache                 │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│          PlaylistService                     │
│  Validates business rules:                   │
│  - Name uniqueness                           │
│  - Playlist exists                           │
│  - Song IDs are valid                        │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│         PlaylistRepository                   │
│  Raw Drizzle CRUD:                           │
│  - insertEntries()                           │
│  - deleteEntries()                           │
│  - updatePositions()                         │
│  - getMaxPosition()                          │
└─────────────────────────────────────────────┘
```

### Operation Framework

Instead of scattering functions across `addSongsToPlaylist.ts`, `removeSongFromPlaylist.ts`, etc., every mutation becomes a **command**:

```typescript
// src/main/collections/operations/types.ts

interface CollectionOperation<TInput, TResult> {
  type: string;
  /** Validate inputs before executing */
  validate(input: TInput): Promise<void>;
  /** Execute within a transaction, return result + journal entry for undo */
  execute(input: TInput, trx: DBTransaction): Promise<OperationResult<TResult>>;
}

interface OperationResult<T> {
  result: T;
  journalEntry: JournalEntry;
  event: CollectionEvent;
}

interface JournalEntry {
  operationType: string;
  collectionType: string;
  collectionId: number;
  operationInput: Record<string, unknown>;
  reverseData: OperationReverseData;
}
```

### Example: AddSongs Operation

```typescript
// src/main/collections/operations/AddSongsOp.ts

interface AddSongsInput {
  playlistId: number;
  songIds: number[];
  insertAt?: number; // null = append at end
}

export const AddSongsOp: CollectionOperation<AddSongsInput, { addedCount: number }> = {
  type: 'addSongs',

  async validate(input) {
    if (input.songIds.length === 0) throw new Error('No songs to add');
    // Validate playlist exists, songs exist, etc.
  },

  async execute(input, trx) {
    const { playlistId, songIds, insertAt } = input;

    // 1. Capture reverse data for undo (which entries to remove)
    const maxPos = insertAt ?? (await playlistRepository.getMaxPosition(playlistId, trx)) + 1;

    // 2. If inserting in the middle, shift existing entries down
    if (insertAt !== undefined) {
      await playlistRepository.shiftPositions(playlistId, insertAt, songIds.length, trx);
    }

    // 3. Insert new entries
    const newEntries = songIds.map((songId, i) => ({
      playlistId,
      songId,
      position: maxPos + i,
      source: 'manual' as const
    }));
    const insertedEntries = await playlistRepository.insertEntries(newEntries, trx);

    // 4. Update denormalized counters
    await playlistRepository.updateCounters(playlistId, trx);

    return {
      result: { addedCount: songIds.length },
      journalEntry: {
        operationType: 'addSongs',
        collectionType: 'playlist',
        collectionId: playlistId,
        operationInput: { songIds, insertAt },
        reverseData: {
          type: 'entries_snapshot',
          entries: insertedEntries.map((e) => ({ entryId: e.id, songId: e.songId, position: e.position }))
        }
      },
      event: {
        type: 'collection:entriesAdded',
        collectionId: { source: 'local', type: 'playlist', id: playlistId },
        addedSongIds: songIds,
        timestamp: Date.now()
      }
    };
  }
};
```

### Operation Journal

The `OperationJournal` records every mutation with enough information to reverse it. Snapshots are one implementation detail — the journal abstraction is what matters.

```typescript
// src/main/collections/operations/OperationJournal.ts

class OperationJournal {
  private static MAX_ENTRIES = 100;
  private static EXPIRY_HOURS = 48;

  /** Record a new operation (called by the Engine after each mutation) */
  async record(entry: JournalEntry): Promise<number> {
    // Insert into operation_journal table
    // Increment sequence number
    // Auto-prune entries beyond MAX_ENTRIES or past EXPIRY_HOURS
  }

  /** Undo the most recent operation for a specific collection */
  async undo(collectionId: CollectionId): Promise<boolean> {
    // Read the latest journal entry
    // Execute the reverse operation within a transaction
    // Mark the journal entry as direction='reverse'
    // Emit undo event
  }

  /** Redo a previously undone operation */
  async redo(collectionId: CollectionId): Promise<boolean> {
    // Read the latest reversed journal entry
    // Re-execute the forward operation
    // Mark the journal entry as direction='forward'
  }

  /** Get the undo/redo stack for a collection (for UI display) */
  async getStack(collectionId: CollectionId): Promise<{
    undoable: JournalEntry[];
    redoable: JournalEntry[];
  }>;
}
```

> [!NOTE]
> This journal abstraction is the foundation for future cloud sync and conflict resolution. When syncing, the journal provides a deterministic sequence of operations that can be replayed, merged, or rebased — all without event sourcing.

---

## 8. Queue Engine

The Queue is **not** a playlist. It has fundamentally different semantics: it is mutable, playback-aware, and transient. It deserves its own engine.

```
QueueEngine
    │
    ├── currentIndex: number          // Which entry is currently playing
    ├── entries: QueueEntry[]          // The queue state
    ├── history: QueueEntry[]          // Previously played (for "back" navigation)
    │
    ├── repeatMode: 'none' | 'one' | 'all'
    ├── shuffleMode: boolean
    ├── shuffleSeed: number           // Deterministic shuffle
    │
    ├── addNext(songIds)              // Insert after current
    ├── addToEnd(songIds)             // Append
    ├── removeEntry(entryId)          // Remove without advancing
    ├── reorder(entryId, newPos)      // Drag-drop reorder
    ├── advance()                     // Move to next (respects repeat/shuffle)
    ├── goBack()                      // Return to previous
    ├── jumpTo(entryId)               // Jump to specific entry
    └── clear()                       // Clear entire queue
```

```typescript
// src/main/collections/engine/QueueEngine.ts

interface QueueState {
  entries: QueueEntry[];
  currentIndex: number;
  history: QueueEntry[];
  repeatMode: 'none' | 'one' | 'all';
  shuffleMode: boolean;
  shuffleSeed: number;
  originalOrder: QueueEntry[]; // Preserved for unshuffle
}

interface QueueEntry {
  entryId: string;         // UUID, not DB-backed
  songId: number;
  position: number;
  addedAt: number;         // timestamp
  source: QueueEntrySource;
}

type QueueEntrySource =
  | { type: 'collection'; collectionId: CollectionId }
  | { type: 'userAction'; action: 'playNext' | 'addToQueue' }
  | { type: 'autoplay' };
```

The `QueueProvider` wraps `QueueEngine` state into a `Collection` view so the queue can be rendered by the same `CollectionView` component as everything else.

---

## 9. Smart Playlist Query Engine

### 9.1 Rule AST

Smart Playlists are defined by a JSON AST that describes filtering rules. The AST is version-tagged so that legacy rules never break when the compiler evolves.

```typescript
// src/main/collections/query/ast.ts

type RuleOperator =
  | 'equals' | 'notEquals'
  | 'contains' | 'notContains'
  | 'startsWith' | 'endsWith'
  | 'greaterThan' | 'lessThan'
  | 'between'
  | 'inLast' | 'notInLast'  // time-based: "added in last 30 days"
  | 'isTrue' | 'isFalse';

type RuleField =
  | 'title' | 'artist' | 'album' | 'genre' | 'year'
  | 'duration' | 'playCount' | 'skipCount' | 'rating'
  | 'addedDate' | 'modifiedDate' | 'lastPlayedDate'
  | 'bitrate' | 'sampleRate' | 'isFavorite' | 'path';

interface RuleCondition {
  field: RuleField;
  operator: RuleOperator;
  value: string | number | boolean | [number, number]; // [min, max] for 'between'
}

interface RuleGroup {
  combinator: 'AND' | 'OR';
  rules: Array<RuleCondition | RuleGroup>; // Recursive nesting
}

interface SmartPlaylistRuleAST {
  version: 1;
  rootGroup: RuleGroup;
}
```

### 9.2 Compiler Pipeline

```
JSON AST
   │
   ▼
Parser (validates structure against version)
   │
   ▼
Query IR (Intermediate Representation)
   │
   ▼
Optimizer (prune dead paths, collapse bounds)
   │
   ▼
Drizzle SQL Compiler (generates WHERE clause)
   │
   ▼
Execute query → populate playlist_entries
```

```typescript
// src/main/collections/query/compiler.ts

class SmartPlaylistCompiler {
  compile(ast: SmartPlaylistRuleAST): SQL {
    return this.compileGroup(ast.rootGroup);
  }

  private compileGroup(group: RuleGroup): SQL {
    const clauses = group.rules.map((rule) =>
      'combinator' in rule
        ? this.compileGroup(rule)
        : this.compileCondition(rule)
    );

    return group.combinator === 'AND'
      ? and(...clauses)!
      : or(...clauses)!;
  }

  private compileCondition(condition: RuleCondition): SQL {
    const column = this.resolveColumn(condition.field);
    switch (condition.operator) {
      case 'equals': return eq(column, condition.value);
      case 'contains': return ilike(column, `%${condition.value}%`);
      case 'greaterThan': return gt(column, condition.value);
      case 'inLast':
        const since = new Date(Date.now() - (condition.value as number) * 86400000);
        return gte(column, since);
      // ... other operators
    }
  }
}
```

### 9.3 Regeneration Strategy

> **Decision (resolved):** Hybrid strategy — debounce small changes, schedule bulk rebuilds through the Scheduler, and always provide manual refresh.

```
Song metadata changed
    │
    ▼
Debounce timer (500ms) — coalesces rapid edits
    │
    ▼
Check: which smart playlists' rules reference the changed fields?
    │
    ├── If provider cost = 'cheap' → regenerate inline
    │
    └── If provider cost = 'expensive' → enqueue in Scheduler
         │
         └── Smart Playlist state → 'building'
              │
              ▼
           Background regeneration via jobScheduler.ts
              │
              ▼
           Smart Playlist state → 'ready'
              │
              ▼
           Emit collection:invalidated event → UI refreshes

Manual refresh button always available in the UI regardless.
```

---

## 10. Collection Pipeline (In-Memory Processing)

After fetching entries from the provider, the pipeline processes them before the UI renders. This happens on the main process before IPC serialization.

```
Source Entries → Filter → Sort → Group → Transform → Serialized View
```

### 10.1 Sort Engine (MusicBee-Style Multi-Level)

```typescript
// src/main/collections/pipeline/SortEngine.ts

interface SortLevel {
  field: string;       // 'title' | 'artist' | 'album' | 'year' | 'duration' | 'addedDate' | 'random'
  direction: 'asc' | 'desc';
  seed?: number;       // For deterministic random sort
}

type SortDefinition = SortLevel[];

// Example: Sort by Random(seed:42) → Year(ASC)
const exampleSort: SortDefinition = [
  { field: 'random', direction: 'asc', seed: 42 },
  { field: 'year', direction: 'asc' }
];
```

### 10.2 Filter Engine

```typescript
// src/main/collections/pipeline/FilterEngine.ts

// Operates on the CURRENT in-memory collection.
// If user has 50k search results and filters by "Genre = Jazz",
// this filters the existing collection without re-running SQL.

interface CollectionFilter {
  field: string;
  operator: 'contains' | 'equals' | 'startsWith';
  value: string;
}
```

### 10.3 Group Engine

```typescript
// src/main/collections/pipeline/GroupEngine.ts

// Groups a flat list into hierarchical sections
// Group by Album → Group by Artist → Group by Year

interface GroupDefinition {
  field: string; // 'album' | 'artist' | 'genre' | 'year' | 'folder'
}

interface GroupedCollection {
  groups: Array<{
    key: string;
    label: string;
    entries: CollectionEntry[];
  }>;
}
```

---

## 11. Collection Context (Persistent UI State)

Every collection remembers exactly how the user left it. Without this, navigating away from a playlist resets all sort/filter/scroll state.

```
Collection → Opened → Context
   │
   ├── currentSort: SortDefinition[]
   ├── currentFilter: CollectionFilter[]
   ├── currentGrouping: GroupDefinition[]
   ├── selectedEntryIds: Set<number>
   ├── scrollPosition: number
   ├── columnLayout: ColumnLayout
   ├── viewMode: ViewMode
   └── expandedGroups: Set<string>
```

```typescript
// src/main/collections/context/CollectionContext.ts

interface CollectionContextData {
  sort: SortDefinition[];
  filters: CollectionFilter[];
  grouping: GroupDefinition[];
  scrollPosition: number;
  columnLayout: ColumnLayout;
  viewMode: ViewMode;
  expandedGroups: string[];
}

class CollectionContextManager {
  /** Load context for a collection (from DB or defaults) */
  async getContext(collectionUri: string): Promise<CollectionContextData>;

  /** Save context when user changes sort/filter/scroll */
  async saveContext(collectionUri: string, context: CollectionContextData): Promise<void>;

  /** Reset to defaults */
  async resetContext(collectionUri: string): Promise<void>;
}
```

---

## 12. Column Provider & View Modes

### 12.1 Column Provider

MusicBee is loved for its columns. In Nora, columns should not be hardcoded JSX — they should come from a `ColumnProvider`.

```typescript
// src/main/collections/context/ColumnProvider.ts

interface ColumnDefinition {
  id: string;          // 'title' | 'artist' | 'album' | 'genre' | 'year' | 'codec' | ...
  label: string;       // Display name
  width: number;       // Default width in pixels
  minWidth: number;
  sortable: boolean;
  resizable: boolean;
  /** Which SongData field this column maps to */
  field: keyof SongData | string;
  /** Custom renderer identifier (for special columns like artwork, rating) */
  renderer?: string;
}

// Default column sets per collection type
const DEFAULT_COLUMNS: Record<CollectionType, string[]> = {
  playlist:      ['title', 'artist', 'album', 'duration', 'addedDate'],
  album:         ['trackNo', 'title', 'artist', 'duration'],
  artist:        ['title', 'album', 'year', 'duration'],
  genre:         ['title', 'artist', 'album', 'duration'],
  folder:        ['title', 'artist', 'album', 'path'],
  favorites:     ['title', 'artist', 'album', 'duration'],
  history:       ['title', 'artist', 'album', 'playedAt'],
  queue:         ['title', 'artist', 'duration'],
  search:        ['title', 'artist', 'album', 'duration'],
  smartPlaylist: ['title', 'artist', 'album', 'duration', 'year']
};

interface ColumnLayout {
  columns: string[];        // Ordered list of column IDs
  widths: Record<string, number>;  // Per-column width overrides
}

// Available columns (all possible)
const ALL_COLUMNS: ColumnDefinition[] = [
  { id: 'title',      label: 'Title',       width: 300, minWidth: 120, sortable: true,  resizable: true, field: 'title' },
  { id: 'artist',     label: 'Artist',      width: 200, minWidth: 100, sortable: true,  resizable: true, field: 'artists' },
  { id: 'album',      label: 'Album',       width: 200, minWidth: 100, sortable: true,  resizable: true, field: 'album' },
  { id: 'genre',      label: 'Genre',       width: 150, minWidth: 80,  sortable: true,  resizable: true, field: 'genres' },
  { id: 'year',       label: 'Year',        width: 60,  minWidth: 50,  sortable: true,  resizable: true, field: 'year' },
  { id: 'duration',   label: 'Duration',    width: 80,  minWidth: 60,  sortable: true,  resizable: false, field: 'duration' },
  { id: 'trackNo',    label: '#',           width: 40,  minWidth: 30,  sortable: true,  resizable: false, field: 'trackNo' },
  { id: 'codec',      label: 'Codec',       width: 80,  minWidth: 60,  sortable: true,  resizable: true, field: 'path', renderer: 'codec' },
  { id: 'bitrate',    label: 'Bitrate',     width: 80,  minWidth: 60,  sortable: true,  resizable: true, field: 'bitrate' },
  { id: 'sampleRate', label: 'Sample Rate', width: 100, minWidth: 80,  sortable: true,  resizable: true, field: 'sampleRate' },
  { id: 'path',       label: 'Path',        width: 400, minWidth: 200, sortable: true,  resizable: true, field: 'path' },
  { id: 'addedDate',  label: 'Date Added',  width: 120, minWidth: 90,  sortable: true,  resizable: true, field: 'addedDate' },
  { id: 'playedAt',   label: 'Last Played', width: 120, minWidth: 90,  sortable: true,  resizable: true, field: 'createdDate' },
  { id: 'discNo',     label: 'Disc',        width: 50,  minWidth: 40,  sortable: true,  resizable: false, field: 'discNo' },
  // Future: ReplayGain, Rating, Custom Tags
];
```

### 12.2 View Modes

Instead of a single `PlaylistPage`, the UI consumes a Collection and presents it interchangeably based on the active `ViewMode`:

```typescript
// src/main/collections/view/ViewModeRegistry.ts

type ViewMode =
  | 'list'        // Default: rows with columns (MusicBee default)
  | 'grid'        // Card grid (album art tiles)
  | 'cards'       // Rich cards with metadata
  | 'compact'     // Dense list, minimal columns
  | 'albumGrid'   // Grouped by album, album art prominent
  | 'grouped'     // Visually grouped by a GroupDefinition
  | 'tree';       // Hierarchical tree (for nested folders/playlists)

// Which view modes are available per collection type
const AVAILABLE_VIEW_MODES: Record<CollectionType, ViewMode[]> = {
  playlist:      ['list', 'grid', 'cards', 'compact', 'grouped'],
  album:         ['list', 'compact'],
  artist:        ['list', 'albumGrid', 'grid'],
  genre:         ['list', 'grid'],
  folder:        ['list', 'tree', 'compact'],
  favorites:     ['list', 'grid', 'cards', 'compact'],
  history:       ['list', 'compact'],
  queue:         ['list', 'compact'],
  search:        ['list', 'grid', 'compact'],
  smartPlaylist: ['list', 'grid', 'cards', 'compact', 'grouped']
};
```

The renderer selects a `CollectionRenderer` based on the active `ViewMode`. The renderer maps `Collection View → Columns → ColumnRenderer`:

```
CollectionView
    │
    ├── viewMode === 'list'    → CollectionListRenderer (uses ColumnProvider)
    ├── viewMode === 'grid'    → CollectionGridRenderer
    ├── viewMode === 'cards'   → CollectionCardsRenderer
    ├── viewMode === 'compact' → CollectionCompactRenderer
    ├── viewMode === 'grouped' → CollectionGroupedRenderer
    └── viewMode === 'tree'    → CollectionTreeRenderer
```

---

## 13. Collection Relationships

This is Roon's magic: every collection knows about its related collections.

```
Playlist ("Jazz Evenings")
    │
    ▼
Related Collections
    │
    ├── Jazz Albums (albums containing songs in this playlist)
    ├── Jazz Artists (artists appearing in this playlist)
    ├── Similar Playlists (playlists with overlapping songs)
    └── Related Genres (genres present in this playlist)
```

```typescript
// src/main/collections/relationships/RelationshipResolver.ts

interface CollectionRelationship {
  type: 'contains' | 'overlaps' | 'relatedBy';
  source: CollectionId;
  target: CollectionId;
  /** Strength of the relationship (0-1, based on overlap percentage) */
  strength: number;
}

interface RelationshipResolver {
  /** Get all related collections for a given collection */
  getRelated(collectionId: CollectionId): Promise<CollectionRelationship[]>;

  /** Graph traversal: "Show me everything related to this collection" */
  traverse(
    startId: CollectionId,
    depth: number
  ): Promise<Map<string, CollectionRelationship[]>>;
}
```

---

## 14. Recommendation & AI Providers (Future)

The architecture naturally supports future recommendation providers because the Collection Platform already exists. Integrating recommendations means generating a collection and letting the pipeline handle the rest.

```
RecommendationProvider
    │
    ├── Discovery Mixes    → "Weekly Discovery" ephemeral collection
    ├── Artist Radio        → "Based on Artist X" generated collection
    ├── Album Radio         → "Based on Album Y" generated collection
    └── Similar Artists     → "Artists like Z" collection
```

```typescript
// Future: src/main/collections/providers/RecommendationProvider.ts

interface RecommendationProvider extends CollectionProvider {
  /** Generate a discovery mix based on listening history */
  generateDiscoveryMix(): Promise<Collection>;

  /** Generate radio based on a seed (artist, album, song) */
  generateRadio(seed: CollectionId): Promise<Collection>;
}
```

Because the Collection Platform architecture exists, integrating AI simply means:
```
User Prompt → Generated AST Query → SmartPlaylistCompiler → Ephemeral Collection
```

---

## 15. Collection Events

All mutations publish strictly typed events. The UI subscribes to these to invalidate TanStack Query caches.

```typescript
// src/main/collections/events/CollectionEvents.ts

type CollectionEvent =
  | { type: 'collection:created'; collectionId: CollectionId }
  | { type: 'collection:deleted'; collectionId: CollectionId }
  | { type: 'collection:renamed'; collectionId: CollectionId; newName: string }
  | { type: 'collection:entriesAdded'; collectionId: CollectionId; addedSongIds: number[] }
  | { type: 'collection:entriesRemoved'; collectionId: CollectionId; removedEntryIds: number[] }
  | { type: 'collection:entriesReordered'; collectionId: CollectionId }
  | { type: 'collection:invalidated'; collectionId: CollectionId }
  | { type: 'collection:stateChanged'; collectionId: CollectionId; state: CollectionState }
  | { type: 'collection:membershipChanged'; songId: number; collectionId: CollectionId };
```

Events flow through the existing `dataUpdateEvent` pattern to the renderer:

```
Engine mutation
   │
   ▼
Emit CollectionEvent
   │
   ├──→ dataUpdateEvent('collections/updated') → renderer invalidates TanStack Query
   │
   ├──→ MembershipCache.invalidate() → keep reverse index current
   │
   └──→ Dependency Graph (future) → targeted cache invalidation
```

---

## 16. Collection Diagnostics

Fitting with Nora's existing observability stack (`libraryObservability.ts`), collections emit deep telemetry through a formal interface.

```typescript
// src/main/collections/diagnostics/CollectionDiagnostics.ts

interface CollectionDiagnostics {
  /** Time to resolve provider and build Collection view */
  providerResolutionTimeMs: number;

  /** Time to compile and execute smart playlist query */
  queryMaterializationTimeMs: number;

  /** Membership cache hit rate (0-1) */
  membershipCacheHitRate: number;

  /** Number of cache hits vs misses */
  cacheHits: number;
  cacheMisses: number;

  /** Time for dependency graph evaluation (future) */
  dependencyEvaluationTimeMs: number;

  /** How many times this collection has been refreshed in the session */
  refreshCount: number;

  /** Pipeline processing time (filter + sort + group) */
  pipelineTimeMs: number;

  /** Journal entry count for this collection */
  journalEntryCount: number;
}

class DiagnosticsCollector {
  /** Record timing for a provider operation */
  recordProviderTiming(collectionId: CollectionId, durationMs: number): void;

  /** Record pipeline processing time */
  recordPipelineTiming(collectionId: CollectionId, durationMs: number): void;

  /** Get aggregated diagnostics for a collection */
  getDiagnostics(collectionId: CollectionId): CollectionDiagnostics;

  /** Get system-wide collection platform diagnostics */
  getSystemDiagnostics(): {
    totalCollections: number;
    averageProviderTime: number;
    averagePipelineTime: number;
    membershipCacheSize: number;
    journalTotalEntries: number;
  };
}
```

---

## 17. IPC Contract Changes

### New Collection API (Coexists with existing APIs during migration)

> **Decision (resolved):** Keep both APIs during migration. Mark `playlistsData.*` as deprecated immediately after `collection.*` is complete. Remove after one stable release once all internal consumers have migrated.

```typescript
// src/preload/index.ts — NEW section

const collections = {
  // ─── Read Operations ───
  getCollection: (collectionId: CollectionId): Promise<Collection> =>
    ipcRenderer.invoke('collection/get', collectionId),

  getCollectionEntries: (
    collectionId: CollectionId,
    start: number,
    end: number,
    sort?: SortDefinition[]
  ): Promise<PaginatedResult<CollectionEntry>> =>
    ipcRenderer.invoke('collection/getEntries', collectionId, start, end, sort),

  getAllCollections: (
    type: CollectionType,
    options?: CollectionQueryOptions
  ): Promise<PaginatedResult<Collection>> =>
    ipcRenderer.invoke('collection/getAll', type, options),

  // ─── Write Operations ───
  addSongsToCollection: (
    collectionId: CollectionId,
    songIds: number[],
    insertAt?: number
  ): Promise<{ addedCount: number }> =>
    ipcRenderer.invoke('collection/addSongs', collectionId, songIds, insertAt),

  removeSongsFromCollection: (
    collectionId: CollectionId,
    entryIds: number[]
  ): Promise<{ removedCount: number }> =>
    ipcRenderer.invoke('collection/removeSongs', collectionId, entryIds),

  reorderEntries: (
    collectionId: CollectionId,
    entryId: number,
    newPosition: number
  ): Promise<void> =>
    ipcRenderer.invoke('collection/reorder', collectionId, entryId, newPosition),

  renameCollection: (collectionId: CollectionId, newName: string): Promise<void> =>
    ipcRenderer.invoke('collection/rename', collectionId, newName),

  deleteCollections: (collectionIds: CollectionId[]): Promise<void> =>
    ipcRenderer.invoke('collection/delete', collectionIds),

  // ─── Membership ───
  getMembership: (songId: number): Promise<CollectionMembership[]> =>
    ipcRenderer.invoke('collection/getMembership', songId),

  getBatchMembership: (songIds: number[]): Promise<BatchMembership> =>
    ipcRenderer.invoke('collection/getBatchMembership', songIds),

  // ─── Smart Playlist Operations ───
  createSmartPlaylist: (
    name: string,
    rules: SmartPlaylistRuleAST,
    maxEntries?: number
  ): Promise<Collection> =>
    ipcRenderer.invoke('collection/createSmart', name, rules, maxEntries),

  regenerateSmartPlaylist: (playlistId: number): Promise<void> =>
    ipcRenderer.invoke('collection/regenerateSmart', playlistId),

  // ─── Undo/Redo ───
  undo: (collectionId: CollectionId): Promise<boolean> =>
    ipcRenderer.invoke('collection/undo', collectionId),

  redo: (collectionId: CollectionId): Promise<boolean> =>
    ipcRenderer.invoke('collection/redo', collectionId),

  // ─── Context ───
  getContext: (collectionUri: string): Promise<CollectionContextData> =>
    ipcRenderer.invoke('collection/getContext', collectionUri),

  saveContext: (collectionUri: string, context: CollectionContextData): Promise<void> =>
    ipcRenderer.invoke('collection/saveContext', collectionUri, context),

  // ─── Export/Import ───
  exportCollection: (collectionId: CollectionId): Promise<void> =>
    ipcRenderer.invoke('collection/export', collectionId),

  importPlaylist: (targetPlaylistId?: number): Promise<void> =>
    ipcRenderer.invoke('collection/import', targetPlaylistId),

  // ─── Sidebar ───
  pinToSidebar: (collectionId: CollectionId, position: number): Promise<void> =>
    ipcRenderer.invoke('collection/pin', collectionId, position),

  unpinFromSidebar: (collectionId: CollectionId): Promise<void> =>
    ipcRenderer.invoke('collection/unpin', collectionId),

  getSidebarPins: (): Promise<Array<{ collectionId: CollectionId; position: number }>> =>
    ipcRenderer.invoke('collection/getSidebarPins'),

  // ─── Relationships ───
  getRelatedCollections: (collectionId: CollectionId): Promise<CollectionRelationship[]> =>
    ipcRenderer.invoke('collection/getRelated', collectionId),

  // ─── Diagnostics ───
  getDiagnostics: (collectionId: CollectionId): Promise<CollectionDiagnostics> =>
    ipcRenderer.invoke('collection/getDiagnostics', collectionId)
};
```

---

## 18. Renderer-Side Collection View

### Universal Collection Page

Instead of separate `PlaylistInfoPage`, `AlbumInfoPage`, `ArtistInfoPage`, etc., a single `CollectionView` component renders any collection based on its capabilities and active view mode:

```typescript
// Conceptual — src/renderer/src/components/CollectionView/CollectionView.tsx

function CollectionView({ collection }: { collection: Collection }) {
  const { capabilities } = collection;
  const context = useCollectionContext(collection.id);
  const columns = useColumnLayout(collection.id.type, context.columnLayout);
  const Renderer = useViewModeRenderer(context.viewMode);

  return (
    <div>
      <CollectionHeader
        collection={collection}
        showRenameButton={capabilities.canRename}
        showDeleteButton={capabilities.canDelete}
        showExportButton={capabilities.canExport}
        showRulesEditor={capabilities.supportsRules}
      />

      <CollectionToolbar
        showFilter={true}
        showSort={true}
        showGroup={true}
        showAddSongs={capabilities.canAddSongs}
        showImport={capabilities.canImport}
        viewMode={context.viewMode}
        availableViewModes={AVAILABLE_VIEW_MODES[collection.id.type]}
      />

      <Renderer
        entries={collection.entries}
        columns={columns}
        enableDragDrop={capabilities.supportsDragDrop}
        enableReorder={capabilities.canReorder}
        enableRemove={capabilities.canRemoveSongs}
        onContextMenu={(songIds) => <MembershipContextMenu songIds={songIds} />}
      />
    </div>
  );
}
```

> [!IMPORTANT]
> The UI **never** checks `if (collection.type === 'playlist')`. It only ever reads `capabilities.*`.

---

## 19. Favorites — Design Decision

> **Decision (resolved):** Keep `songs.isFavorite` as the storage. It's the simplest and fastest representation.

The `FavoritesProvider` reads `songs WHERE is_favorite = true` and wraps the results into a `Collection` view. The `MembershipService` knows that toggling a song's favorite status means flipping `songs.isFavorite` rather than inserting/deleting a `playlist_entries` row.

This is simpler and consistent with how Favorites has always worked in Nora. The inconsistency is contained within the provider — the UI sees a Collection like any other.

---

## 20. Database Migration Strategy

```
Phase 1: Create playlist_entries (shadow table)
   │
   ▼
Phase 2: Migrate playlists_songs → playlist_entries (with generated positions)
   │
   ▼
Phase 3: Verify parity (cross-reference song counts and order)
   │
   ▼
Phase 4: Switch all code to read from playlist_entries
   │
   ▼
Phase 5: Drop legacy playlists_songs table
   │
   ▼
Phase 6: Retain rollback snapshot for 1 release cycle
```

### Migration Script

```typescript
// Migration: playlists_songs → playlist_entries

async function migratePlaylistEntries(trx: DBTransaction) {
  const allPlaylists = await trx.select().from(playlists);

  for (const playlist of allPlaylists) {
    const currentSongs = await trx
      .select()
      .from(playlistsSongs)
      .where(eq(playlistsSongs.playlistId, playlist.id))
      .orderBy(asc(playlistsSongs.createdAt));

    const entries = currentSongs.map((song, index) => ({
      playlistId: playlist.id,
      songId: song.songId,
      position: index + 1,
      source: 'migration' as const
    }));

    if (entries.length > 0) {
      await trx.insert(playlistEntries).values(entries);
    }

    await trx
      .update(playlists)
      .set({ itemCount: entries.length })
      .where(eq(playlists.id, playlist.id));
  }
}
```

---

## 21. Performance Architecture

| Concern | Strategy |
|:---|:---|
| **Pagination** | `getEntries()` enforces `start`/`end` parameters. A 50k playlist fetches only the visible chunk. |
| **Denormalized counters** | `playlists.itemCount` and `playlists.totalDuration` are updated atomically during Engine mutations. The sidebar shows counts instantly without `COUNT(*)`. |
| **Virtualization** | The renderer uses the existing `VirtualizedList.tsx` component for massive entry lists. |
| **Incremental counters** | On `addSongs`, counters are `+= N` not `SELECT COUNT(*)`. |
| **Index coverage** | `idx_playlist_entries_playlist_position` covers the primary access pattern (entries for a playlist, ordered). |
| **Membership cache** | O(1) lookups for context menu rendering via in-memory reverse index. |

---

## 22. Concurrency Model

```
Read Operations  → Parallel execution (no locks)
                     │
Mutation Operations → Serialized via DB transactions
                     │
Smart Playlist Gen → Scheduler background queue (existing jobScheduler.ts)
                     │
Cache Refresh       → Scheduler maintenance jobs
                     │
Journal Cleanup     → Scheduler maintenance (prune expired entries)
```

All mutations route through the `PlaylistEngine`, which wraps every operation in a database transaction. The existing `jobScheduler.ts` handles background work (smart playlist regeneration, journal cleanup, membership cache warming).

---

### Milestone 1: Core Engine & Data Foundations (Phases 1–3)
> **Goal:** Establish database entry identity, transactions, collection descriptors, and central registry hub.

| Sub-Phase | Goal | Key Deliverables |
|:---|:---|:---|
| **Phase 1** | Schema Foundations | `playlist_entries` table, `playlists` table enhancements (description, parentId, playlistType, counters), `smart_playlist_rules` table, `operation_journal` table, `collection_contexts` table. Drizzle migration scripts. |
| **Phase 2** | Data Migration | Safe migration script: `playlists_songs` → `playlist_entries` with sequential position generation & data parity verification. |
| **Phase 3** | Collection Types & Registry | `CollectionId`, `CollectionType`, `CollectionCapabilities`, `CollectionState`, `Collection` types. Central `CollectionRegistry` with descriptor registration, `CAPABILITY_PRESETS` for all 10 collection types, and `ProviderCost` declarations. |

---

### Milestone 2: Provider Layer, Mutations & Membership (Phases 4–6)
> **Goal:** Build read-only data translation providers, transactional mutation engines with journal undo, and context-menu membership tracking.

| Sub-Phase | Goal | Key Deliverables |
|:---|:---|:---|
| **Phase 4** | Provider & Resolver Layer | `CollectionProvider` interface. `PlaylistProvider`, `AlbumProvider`, `ArtistProvider`, `GenreProvider`, `FolderProvider`, `FavoritesProvider`, `HistoryProvider`, `SearchProvider`. `CollectionResolver` routing. |
| **Phase 5** | Playlist Engine & Operations | Layered `PlaylistRepository` → `PlaylistService` → `PlaylistEngine`. Command operations (`AddSongsOp`, `RemoveSongsOp`, `ReorderOp`, `RenameOp`). `OperationJournal` with undo/redo stack. |
| **Phase 6** | Membership System | `MembershipService`, `MembershipCache` reverse index. IPC handlers for membership queries and tri-state context menu support. |

---

### Milestone 3: Renderer Integration & Processing Pipeline (Phases 7–8)
> **Goal:** Expose unified `collection/*` IPC contract, create capability-driven `CollectionView`, dynamic `ColumnProvider`, `CollectionContext`, and multi-level in-memory pipeline.

| Sub-Phase | Goal | Key Deliverables |
|:---|:---|:---|
| **Phase 7** | IPC & Universal Renderer | New `collection/*` IPC contract. Universal `CollectionView` React component. `ColumnProvider` with 14 definitions. `ViewModeRegistry` (7 view modes). `CollectionContextManager` for persistent UI state. |
| **Phase 8** | Processing Pipeline | `SortEngine` (multi-level MusicBee sorting), `FilterEngine` (in-memory filtering), `GroupEngine` (hierarchical grouping). `SortDefinition` types. |

---

### Milestone 4: Advanced Engines & Ecosystem (Phases 9–11)
> **Goal:** Rule-based Smart Playlists, playback-aware Queue Engine, Sidebar pinning, collection graph relationships, and platform observability.

| Sub-Phase | Goal | Key Deliverables |
|:---|:---|:---|
| **Phase 9** | Smart Playlist Query Engine | `SmartPlaylistRuleAST`, `SmartPlaylistCompiler` (AST → IR → Drizzle SQL), rule editor GUI, hybrid regeneration strategy integrated with `jobScheduler.ts`. |
| **Phase 10** | Queue Engine | `QueueEngine` with playback awareness, current index tracking, history, repeat/shuffle modes. `QueueProvider` wrapping queue state into a `Collection` view. |
| **Phase 11** | Sidebar, Graph & Diagnostics | Sidebar pinning API, nested playlist folders, merge/duplicate operations, `RelationshipResolver` (graph traversal), `CollectionDiagnostics` telemetry. |

> [!WARNING]
> **Foundational Execution Barrier:** Milestones 1 and 2 (Phases 1–6) form the non-negotiable core backend foundation. No renderer/UI migration should begin until Milestones 1 and 2 are fully built, tested, and validated. Each phase must be gated behind feature flags for safe, incremental rollout.


---

## 24. Architectural Invariants

These rules are non-negotiable. Any code violating them introduces architectural drift.

1. **Collections are presentation abstractions.** Domain models (Playlists, Albums) remain independent.
2. **A Playlist owns Entries.** Entries reference Songs. A Collection never owns Songs directly.
3. **Providers never mutate.** Providers are read-only translation layers.
4. **Repositories never validate.** Repositories handle only data persistence.
5. **Services never render.** UI logic stays in the React layer.
6. **The Engine owns mutations.** All write operations route through the Engine's transactional commands.
7. **The Scheduler owns background work.** No heavy queries block the main thread.
8. **Capabilities drive the UI.** The renderer never uses `if (type === 'playlist')`.
9. **The Registry is the single source of truth** for collection metadata, capabilities, and cost.
10. **Operations are journaled.** Every mutation records a journal entry for undo/redo.
11. **Counters are incremental.** Never `SELECT COUNT(*)` for UI display.
12. **No subsystem bypasses the Collection API.** The UI interacts only through the unified IPC contract.
13. **Membership is cached.** The `MembershipCache` provides O(1) lookups; never query the DB inline for context menus.
14. **Context is persisted.** Users never lose their sort/filter/scroll state when navigating away.
15. **Columns are data-driven.** Column definitions come from `ColumnProvider`, never hardcoded in JSX.

---

## 25. Resolved Design Decisions

| Decision | Resolution | Rationale |
|:---|:---|:---|
| Per-entry metadata | Defer to later phase | Keep Phase 1 focused on Entry Identity, ordering, and transactions |
| Favorites storage | Keep `songs.isFavorite` | Simplest and fastest representation. Inconsistency contained within `FavoritesProvider` |
| Smart Playlist triggers | Hybrid: debounce + scheduler + manual | Cheap providers regenerate inline; expensive ones go through Scheduler. Manual refresh always available |
| Legacy API deprecation | 1 stable release overlap | Mark `playlistsData.*` deprecated after `collection.*` complete. Remove after one stable release |
