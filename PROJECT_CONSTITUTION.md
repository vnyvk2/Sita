# Nora Music Player
# Architecture Roadmap & Long-Term Vision

---

# Vision

Nora is **not** a traditional music player.

It is a **modular music intelligence platform** capable of managing, understanding, enriching, organizing, and recommending music through reusable engines rather than feature-specific implementations.

Every subsystem should solve one problem well and expose reusable outputs that other systems consume.

---

# Core Architecture Principles

## Principle 1

Every subsystem owns one responsibility.

Never mix responsibilities.

Examples

```
Metadata Engine

Tag Engine

Rule Engine

Recommendation Engine

Search Engine
```

Each has exactly one job.

---

## Principle 2

Every subsystem produces data.

No subsystem should know who consumes it.

```
Metadata

↓

Tag Engine

↓

Rule Engine

↓

Collections

↓

Recommendation
```

Metadata never calls the Rule Engine.

Rule Engine never calls Recommendation.

Everything communicates through well-defined models.

---

## Principle 3

Everything should be extensible.

No switch statements.

Instead use

```
Registry

Provider

Plugin

Strategy

Pipeline
```

patterns.

---

## Principle 4

Features are compositions of engines.

Never build feature-specific logic.

Bad

```
Smart Playlist logic
```

Good

```
Rule Engine

+

Membership Engine

+

Collections
```

---

## Principle 5

Canonical Data

Every piece of information should exist once.

Everything else derives from it.

---

# ERA 1 — Core Platform ✅

Goal

Build a reliable music management platform.

Completed

```
Library Scanner

Repository Layer

Collections

Playlist Engine

Undo/Redo

Operation Journal

Membership Service

Import Framework

Export Framework

Artwork Pipeline

Plugin Foundation

Diagnostics

Observability

Background Scheduler

Persistence

Event Bus

Transaction Framework

Search Engine
```

Everything here focuses on correctness.

---

# ERA 2 — Intelligence Platform

Everything below builds reusable engines.

---

# Layer 1

Metadata Platform

```
Providers

↓

Metadata Ingestion

↓

Canonical Metadata Store

↓

Metadata Derivation

↓

Consumers
```

---

Metadata Sources

```
File Tags

MusicBrainz

Spotify

Discogs

Last.fm

Wikipedia

AcousticBrainz

AI

User

Plugins
```

---

Metadata Model

Every value stores

```
value

source

provider

confidence

updatedAt

verified

priority
```

---

Split Metadata

Facts

```
Title

Album

Artist

Track

Disc

Year

Duration

ISRC
```

Derived

```
Genre

Mood

Energy

Language

Popularity

Embeddings

Duplicate Score
```

Derived data never overwrites facts.

---

# Layer 2

Identity Engine

Different providers identify the same song differently.

```
Local Song ID

ISRC

MusicBrainz ID

Spotify ID

Discogs ID

AcoustID

Fingerprint

File Hash
```

Identity resolution becomes its own engine.

---

# Layer 3

Feature Store

Instead of Audio Analysis.

```
Song

↓

Analysis Pipeline

↓

Feature Store
```

Stores

```
Tempo

BPM

Key

Energy

Danceability

ReplayGain

Loudness

Spectrogram

Waveform

Embeddings

Mood Vector

Genre Vector
```

Nothing computes features twice.

---

# Layer 4

Tag Engine

One of the most important engines.

Not

```
song.tags
```

Instead

Tag model

```
Tag

Namespace

Type

Visibility

Priority

Confidence

Provider

Source

Aliases

Relationships

CreatedBy

UpdatedAt
```

Supports

```
Manual Tags

Automatic Tags

Provider Tags

AI Tags

Plugin Tags

Temporary Tags

Hidden Tags
```

---

Tag Relationships

```
Rock

↓

Alternative Rock

↓

Indie Rock
```

Aliases

```
Hip-Hop

=

Hip Hop
```

---

# Layer 5

Genre Intelligence

Genre becomes its own system.

Not a string.

Instead

Genre Graph

```
Rock

Alternative

Metal

Pop

Jazz

Electronic

```

Relationships

```
Parent

Child

Similarity

Influence

Weight
```

Supports

```
Genre Expansion

Genre Similarity

Subgenres

Hybrid Genres
```

---

# Layer 6

Rule Engine

This is Nora's query language.

Architecture

```
Rule Language

↓

Parser

↓

AST

↓

Optimizer

↓

Evaluator

↓

Song IDs
```

Example

```
Genre = Rock

AND

Rating > 4

AND

Energy > 0.7

AND

Not Played Recently
```

Compiled into AST.

---

Supported operators

```
AND

OR

NOT

()

Comparison

Contains

Regex

Between

Exists

Date

Time

Math

Functions
```

---

# Layer 7

Membership Engine

Current Membership Service evolves.

Providers

```
Static

Rule

Tag

Genre

Folder

Recommendation

Plugin

History
```

Outputs

```
Song IDs
```

Collections never know how membership was generated.

---

# Layer 8

Collection Engine

Everything becomes a Collection.

Not just playlists.

```
Playlist

Folder

Album

Artist

Genre

Mood

Year

Language

Label

Favorites

History

Recommendations

Daily Mix

Temporary Collection
```

Everything exposes

```
Collection

↓

Membership Provider

↓

Entries
```

---

# Layer 9

Search Engine

Consumes

```
Metadata

Tags

Features

Collections

History
```

Supports

```
Exact

Fuzzy

Phonetic

Semantic

Embedding

Rule Search
```

---

Search Index

```
Metadata

↓

Indexer

↓

Search Index

↓

Query Engine
```

---

# Layer 10

Statistics Engine

Consumes Events

```
Play

Skip

Import

Tag

Rating

Collection

Artwork
```

Produces

```
Listening Stats

Artist Stats

Genre Trends

Discovery

Insights
```

---

# Layer 11

Recommendation Engine

Consumes

```
Metadata

Tags

Features

History

Rules

Collections

Ratings

Time

Context
```

Produces

```
Daily Mix

Recommendations

Continue Listening

Rediscovery

Forgotten Favorites

Mood Mix

Genre Mix

Discovery Queue
```

---

# Layer 12

Automation Engine

Architecture

```
Trigger

↓

Conditions

↓

Actions
```

Triggers

```
Import Complete

Metadata Updated

Artwork Changed

Playlist Changed

Timer

Folder Scan

Plugin Event
```

Actions

```
Fetch Metadata

Analyze

Tag

Refresh Rules

Generate Playlist

Export

Notify

Run Plugin
```

---

# Layer 13

Provider Ecosystem

Every external integration becomes a provider.

Metadata

```
MusicBrainz

Discogs

Spotify

Last.fm

Wikipedia
```

Analysis

```
Essentia

Librosa

Plugins
```

Recommendation

```
Spotify

Local

AI

Plugin
```

Import

```
M3U

XSPF

Spotify

Apple

YouTube
```

Export

```
M3U

XSPF

CSV

JSON

Plugin
```

---

# Layer 14

Plugin Ecosystem

Plugins should never patch core code.

Plugin Types

```
Metadata Provider

Rule Provider

Import Provider

Export Provider

Recommendation Provider

Search Provider

Tag Provider

Automation Action

Automation Trigger

Visualization

Audio Analyzer
```

---

# Layer 15

AI Layer

AI owns nothing.

AI translates intent.

```
User

↓

LLM

↓

Rule Builder

↓

Rule Engine
```

or

```
LLM

↓

Metadata Suggestions

↓

Metadata Engine
```

or

```
LLM

↓

Tag Suggestions

↓

Tag Engine
```

No direct DB access.

No playlist generation logic.

Everything uses existing engines.

---

# Layer 16

Knowledge Graph

Final layer.

Built from everything else.

Nodes

```
Song

Artist

Album

Genre

Mood

Tag

Playlist

Collection

History

User

Provider
```

Edges

```
Performed By

Contains

Similar To

Played With

Tagged As

Inspired By

Appears In

Recommended With
```

---

# Event Architecture

Everything publishes events.

```
Song Imported

Metadata Updated

Tag Added

Artwork Changed

Collection Changed

Rule Changed

Playlist Updated

Analysis Completed
```

↓

Event Bus

↓

Consumers

No engine directly calls another engine.

---

# Data Flow

```
Providers

↓

Metadata Store

↓

Feature Store

↓

Tag Engine

↓

Rule Engine

↓

Membership Engine

↓

Collections

↓

Search

↓

Recommendations

↓

Automation

↓

AI

↓

Knowledge Graph
```

Notice that every layer depends only on the layers beneath it.

---

# Future Schema Additions

When the Intelligence Era begins, introduce:

```
tags
song_tags
tag_aliases
tag_relationships

metadata_sources
metadata_history

analysis_features

provider_registry

recommendation_cache

automation_workflows

automation_history

knowledge_graph_nodes
knowledge_graph_edges
```

Avoid adding ad-hoc columns for every new feature; prefer normalized tables or structured JSON where appropriate.

---

# Long-Term Goals

Nora should eventually be able to:

- Import playlists and repair broken paths intelligently.
- Enrich music metadata from multiple providers.
- Auto-tag songs with confidence scores and provenance.
- Understand genres as a graph rather than plain text.
- Build dynamic collections from reusable rule definitions.
- Recommend music using metadata, listening history, tags, and audio features.
- Automate repetitive workflows through triggers and actions.
- Let AI translate natural-language requests into existing rules and engines.
- Represent the music library as a knowledge graph for discovery and insights.

---

# Development Philosophy

Every new feature should answer these questions before implementation:

1. **Should this be an engine instead of a feature?**
2. **Can another subsystem reuse the output?**
3. **Does it expose a clean provider/strategy interface?**
4. **Can plugins extend it without modifying core code?**
5. **Does it publish structured events instead of directly invoking consumers?**
6. **Is it preserving canonical data instead of duplicating state?**
7. **Will this architecture still make sense when the library contains 1 million songs?**

If the answer to any of these is "no," reconsider the design before writing code.
