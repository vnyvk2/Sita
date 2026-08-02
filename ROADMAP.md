# Nora — Platform Roadmap & Architectural Vision

> **Vision**: Transform Nora from a desktop music player into a unified, intelligent music platform where every subsystem feeds into a shared engine pipeline.

---

## 🏗️ High-Level Platform Architecture

```
                        User
                          │
                    Music Library
                          │
            ┌─────────────┴─────────────┐
            │                           │
      Metadata Layer              User Layer
            │                           │
            └─────────────┬─────────────┘
                          │
                 Music Intelligence
                          │
          ┌───────────────┼────────────────┐
          │               │                │
     Rules Engine     Smart Engine     Recommendation
          │               │                │
          └───────────────┴────────────────┘
                          │
                  Dynamic Experience
```

---

## 🏛️ Shared Engine Pipeline Principle

Every feature in Nora plugs into a shared engine pipeline rather than being built as an isolated, feature-specific implementation.

```
Metadata Providers
        │
        ▼
Metadata Layer
        │
        ▼
Tag Engine
        │
        ▼
Rules Engine
        │
        ▼
Smart Playlists
        │
        ▼
Dynamic Collections
        │
        ▼
Recommendations
        │
        ▼
Automation
        │
        ▼
AI
```

*Adding a new metadata provider, AI tagger, or custom tag automatically propagates throughout the entire system—from smart playlists to dynamic collections and recommendations—without writing one-off integration logic.*

---

## 🎯 Phase Breakdown

### Phase 0 — Foundation (Completed) ✅
The core collections engine and backend infrastructure is fully operational:
- **Collections Backend**: Full CRUD operations, playlist hierarchy support, undo/redo system, transaction/operation framework, central event bus, repository layer, and engine abstraction.
- **Playlist Import Framework**: Multi-format parser, repair engine, track resolver, execution planner, import executor, merge/create/replace modes, and import analysis.
- **Playlist Export**: M3U and M3U8 format writers, batch export, path collision resolution, and relative path support.
- **Artwork**: Dynamic playlist artwork pipeline, engine integration, and atomic transactions.
- **Search Engine**: Fast multi-field library search engine and filter pipeline.
- **Performance**: SQLite parameter chunking, batch lookups, import batching, and query/repository optimizations.

---

### Phase 1 — Rules Engine 🧠 *(Next Immediate Priority)*
Replaces hardcoded logic (Favorites, History, Recently Added, Most Played) with a universal AST-compiled rules engine.
- **Pipeline**: `Rule Definition` ➔ `AST Compiler` ➔ `Optimizer` ➔ `Evaluator` ➔ `Song IDs`
- **Expressions**: Boolean logic (`AND`, `OR`, `NOT`), field comparisons (`Genre = 'Rock'`, `Rating >= 4`), temporal constraints (`Last Played < 30 days`), and event flags (`Not Skipped`).

---

### Phase 2 — Smart Playlists ⚡
Builds dynamic playlists powered by the Rules Engine.
- **Fully Configurable**: Zero hardcoded smart playlists.
- **Examples**:
  - *Road Trip*: `Energy > 80 AND Genre = 'Rock' AND Tempo > 120`
  - *Study*: `Instrumental AND Rating > 4 AND NOT Genre = 'Metal'`
  - *Monthly Discoveries*: `Added This Month AND Not Played`

---

### Phase 3 — Dynamic Collections 📂
Extends the collection concept beyond traditional playlists into dynamically generated views.
- **Dynamic Categories**: Albums, Artists, Genres, Folders, Tags, Years, Labels, Languages, Moods.
- **Automated Organization**: Rendered on-the-fly based on underlying metadata and rules.

---

### Phase 4 — Genre Intelligence 🎸
Evolves simple text genre strings into a multi-layered classification framework.
- **Rich Schema**: Multi-genre assignments, confidence scores, genre hierarchies (e.g., `Rock` ➔ `Alternative Rock` ➔ `Indie Rock`), aliases, and regional/custom user genres.
- **Providers**: MusicBrainz, Spotify, Discogs, Last.fm, AcousticBrainz, and manual user overrides.

---

### Phase 5 — Tagging Framework 🏷️
Treats tags as rich, structured domain objects rather than plain strings.
- **Tag Attributes**: `id`, `name`, `type`, `source`, `confidence`, `creator`, `timestamp`, `color`, `icon`, `visibility`.
- **Sources**: `Manual`, `Auto`, `AI`, `Imported`, `Metadata`, `Online`.
- **Types**: `Mood`, `Situation`, `Language`, `Instrument`, `Energy`, `Workout`, `Driving`, `Study`, `Sleep`, `Favorite`, `Personal`.

---

### Phase 6 — Auto-Tagging Pipeline 🤖
Automates library tagging via multi-source data ingestion.
- **Sources**: MusicBrainz, Spotify, Last.fm, Discogs, AcousticBrainz, Lyrics, Wikipedia, AI model inference.
- **Pipeline**: `Song` ➔ `Existing Metadata` ➔ `Online Providers` ➔ `Merge & Conflict Resolution` ➔ `Confidence Calculation` ➔ `Tag Engine`.

---

### Phase 7 — Metadata Intelligence 📊
Deepens track metadata coverage beyond basic ID3 tags.
- **Attributes**: Label, Producer, Composer, Country, Mood, Era, Popularity, Release History, Awards, Live Version status, Remaster flag, Explicit flag, Acousticness, BPM, Key, Camelot Key, ReplayGain, Loudness.

---

### Phase 8 — Audio Analysis 🎵
Performs offline local audio processing and feature extraction.
- **Signal Processing**: Tempo, BPM, Musical Key detection, Danceability, Energy, Instrumentalness, Speechiness, Loudness, Dynamics.
- **Vector Embeddings**: Local AI embeddings for acoustic similarity queries.

---

### Phase 9 — Recommendation Engine 💡
Provides contextual and intelligent track recommendations.
- **Contextual Signals**: Listening history, active tags, genre graphs, time of day, weather, location (optional), mood state, favorites, and skip habits.
- **Context Prompts**: *Friday Night*, *Morning Focus*, *Rainy Afternoon*.

---

### Phase 10 — Statistics Engine 📈
Delivers deep analytics on listening habits.
- **Metrics**: Most replayed, most skipped, growing artists, forgotten gems, monthly discovery trends, genre evolution timelines, listening heat maps, and interactive timelines.

---

### Phase 11 — Automation Engine ⚙️
Enables user-defined automated workflows and trigger-action rules.
- **Trigger/Action Examples**:
  - `IF (Rating > 4 AND Not Played in 60 Days) THEN Notify User`
  - `EVERY Friday THEN Generate Weekend Mix Playlist`
  - `EVERY Month THEN Archive Unheard Imports`

---

### Phase 12 — Plugin SDK 🔌
Exposes an extensible SDK for community plugins and custom integrations.
- **Extension Points**: Metadata Providers, Importers/Exporters, Rule Evaluators, Visualizations, Lyrics Fetchers, DSP Effects, AI Services.

---

### Phase 13 — Cloud Layer (Optional) ☁️
Provides seamless cross-device synchronization.
- **Sync Targets**: Tags, rules, playlists, metadata corrections, play history, and recommendation preferences across devices.

---

### Phase 14 — Natural Language & AI Layer 🔮
Integrates natural language processing and advanced AI interfaces.
- **Capabilities**:
  - Conversational playlist generation (e.g., *"Create a playlist for a rainy evening with Telugu melodies and soft piano"*).
  - Acoustic similarity searches (e.g., *"Find songs similar to this one but happier"*).
  - Automated library organization and missing metadata remediation.

---

### Phase 15 — Music Knowledge Graph 🌐
Connects all entities within Nora into a unified graph database model.
- **Graph Nodes & Edges**:
  `Song` ↔ `Artist` ↔ `Album` ↔ `Genre` ↔ `Mood` ↔ `Tags` ↔ `Contributors` ↔ `Label` ↔ `Country` ↔ `History` ↔ `Recommendations`.

---

## 📋 Priority Execution Queue

1. **Phase 1 — Rules Engine** (AST, Parser, Evaluator, Optimizer)
2. **Phase 2 — Smart Playlists**
3. **Phase 3 — Dynamic Collections**
4. **Phase 4 — Genre Intelligence**
5. **Phase 5 — Tagging Framework** (Manual + Auto-ready)
6. **Phase 6 — Metadata Provider Framework**
7. **Phase 7 — Auto-Tagging Pipeline**
8. **Phase 8 — Audio Analysis**
9. **Phase 9 — Recommendation Engine**
10. **Phase 10 — Statistics & Insights**
11. **Phase 11 — Automation Engine**
12. **Phase 12 — Plugin SDK Expansion**
13. **Phase 13 — AI Layer**
14. **Phase 14 — Music Knowledge Graph**
