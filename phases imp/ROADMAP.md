# Phase A — Final Core Cleanup (1–2 weeks)

These are the last architectural cleanup items I'd do before moving on.

### Must-do

- ✅ Finish `OperationRegistry` registrations (undo/redo completeness).
- ✅ Remove the legacy `playlists_songs` schema after a migration.
- ✅ Review orphaned IPC handlers (`playlistImport:*`) and remove or expose them intentionally.
- ✅ Audit remaining TODOs and FIXME comments.
- ✅ Add a few integration tests around import/export and playlist operations.

After this, I would consider the **Collections architecture "v1 complete."**

---

# Phase B — Metadata Platform ⭐⭐⭐⭐⭐

This is where I'd invest next.

Not genres.

Not tags.

Not smart playlists.

Instead, build the thing everything else will depend on.

```
Metadata Providers

↓

Metadata Engine

↓

Metadata Store
```

This is probably the most important architectural decision for Nora's future.

---

## Build the Metadata Engine

It should answer questions like:

```
Where did this genre come from?

Who supplied this BPM?

Which provider has higher confidence?

Should user edits override Spotify?

When was this metadata updated?
```

Every future feature depends on this.

---

# Phase C — Tag Engine ⭐⭐⭐⭐⭐

Then build the Tag Engine.

This is much bigger than "tags."

```
Manual

Automatic

AI

Online

Plugin
```

All become the same thing.

Then later

```
tag:Workout

tag:Night

tag:Driving

tag:Happy
```

become usable everywhere.

---

# Phase D — Rule Engine ⭐⭐⭐⭐⭐

This is the biggest feature after Collections.

Instead of writing

```
Smart Playlist
```

you build

```
Rule

↓

AST

↓

Evaluator
```

Then

Smart Playlists

Dynamic Collections

Search Filters

Recommendations

AI

all use the same engine.

---

# Phase E — Genre Intelligence

Now comes genre.

Because now

Genre is just another provider.

```
MusicBrainz

↓

Metadata

↓

Genre

↓

Tag Engine

↓

Rule Engine
```

No special logic.

---

# Phase F — Provider Ecosystem

Now implement

```
MusicBrainz

Discogs

Spotify

Last.fm

Wikipedia
```

Each becomes

```
MetadataProvider
```

Nothing else.

---

# Phase G — Audio Analysis

After metadata.

```
Audio

↓

Analysis

↓

Feature Store
```

Produces

```
BPM

Mood

Energy

Danceability

Key

ReplayGain

Embedding
```

---

# Phase H — Smart Collections

Almost free now.

Because you already have

```
Collections

Membership Engine

Rule Engine
```

---

# Phase I — Recommendations

Now recommendations become easy.

```
Metadata

+

History

+

Features

+

Tags

+

Rules
```

↓

Recommendation Engine

---

# Phase J — Automation

```
Trigger

↓

Condition

↓

Action
```

Examples

```
Import Finished

↓

Fetch Metadata

↓

Analyze

↓

Tag

↓

Refresh Rules
```

---

# Phase K — AI

Only now.

Because AI becomes

```
Translate Intent
```

not

```
Business Logic
```

---

# Phase L — Knowledge Graph

Final destination.

Everything you've built naturally forms a graph.

---

# Things I would intentionally postpone

Don't rush these.

### Streaming export

Probably unnecessary until someone exports 100k songs.

---

### Keyset pagination

Great architecture.

No user benefit today.

---

### Accessibility overhaul

Should happen before a stable release.

Not before Intelligence.

---

### Micro-optimizations

Only optimize after profiling.

---

# One thing I would do differently than most projects

I would write **design documents before code**.

For every major engine:

```
Metadata Engine

Tag Engine

Rule Engine

Recommendation Engine

Automation Engine
```

create a document answering:

- Problem statement
- Data model
- Responsibilities
- Boundaries
- Provider interfaces
- Event flow
- Future extensions
- What it explicitly does **not** do

Those documents will save you from architectural drift.

---

# The roadmap I'd follow

```
Current
│
├── Final Cleanup (100%)
│
├── Metadata Engine
│
├── Tag Engine
│
├── Rule Engine
│
├── Genre Intelligence
│
├── Provider Ecosystem
│
├── Feature Store
│
├── Smart Collections
│
├── Recommendation Engine
│
├── Automation
│
├── AI Integration
│
└── Knowledge Graph
```

## One final recommendation

Before writing the first line of the Metadata Engine, I'd spend a few days designing the **Intelligence Architecture** with the same care you put into the Collections backend. That design will influence the next several years of Nora's evolution. If the Collections architecture was the foundation that made playlist management robust, the Metadata → Tags → Rules pipeline will become the foundation that everything else—smart playlists, genre intelligence, recommendations, automation, and AI—builds upon. I would treat it as the second major architectural milestone of the project.
