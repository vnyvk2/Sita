Phase 1-4
│
├── Collections Architecture
├── Playlist Engine
├── Operation Framework
└── Repository Layer
        │
        ▼
Phase 5 ✅
Metadata Engine
│
├── MetadataEntity
├── MetadataGateway
├── MetadataEngine
├── Entity Loaders
└── Search Gateway
        │
        ▼
Phase 6 ✅
Membership Engine
│
├── Repository
├── Cache
├── Service
├── EventBus
├── Bootstrap
└── IPC
        │
        ▼
Phase 7 ✅
Application Adoption
│
├── PlaylistRepository → MembershipService
├── Batch APIs
├── Event wiring
├── Cache invalidation
└── Legacy cleanup

                 Renderer
                     │
                 IPC Layer
                     │
      ┌──────────────┴──────────────┐
      │                             │
      ▼                             ▼
Metadata Engine              Membership Engine
      │                             │
      └──────────────┬──────────────┘
                     │
             Collection Operations
                     │
              PlaylistRepository
                     │
                 Drizzle ORM
                     │
                  PostgreSQL






                           NORA ARCHITECTURE

                                     DATABASE
                                        │
                                  Drizzle ORM
                                        │
 ┌──────────────────────────────────────┼──────────────────────────────────────┐
 │                                      │                                      │
 │                                      │                                      │
 ▼                                      ▼                                      ▼

Phase 1-4                        Phase 5 ✅                           Phase 6-7 ✅
Collections Core                 Metadata Engine                      Membership Engine
───────────────                  ───────────────                      ─────────────────
Operations                       MetadataBootstrap                    MembershipBootstrap
Repositories                     MetadataGateway                      MembershipService
Import/Export                    MetadataEngine                       MembershipCache
Statistics                       EntityLoaders                        MembershipRepository
Playlist Engine                  Search Gateway                       MembershipEventBus
                                 SearchCoordinator                    IPC
                                                                      Batch APIs
                                                                      Adoption
                                                                      Cache Events

                                        │
                                        ▼

                            Application Layer
                PlaylistRepository / Collection Operations
                                        │
                                        ▼
                                 Renderer (IPC)



                Nora Architecture Roadmap

──────────────────────────────────────────────

                Foundation
                     │
                     ▼
      Phase 1–4
      Metadata Infrastructure
      Entity Models
      Field Registry
      Loader System
      Index Pipeline

                     │
                     ▼
          Phase 5
      Metadata Engine
      Search Engine
      Hydration
      Gateway
      Search API

                     │
                     ▼
          Phase 6
      Membership Engine
      Cache
      Repository
      Service
      Event Bus
      IPC

                     │
                     ▼
          Phase 7
      Membership Adoption
      PlaylistRepository Migration
      Batch APIs
      Cache Invalidation
      Event Wiring
      Cleanup

                     │
                     ▼
          ⭐ Phase 8
      Consolidation
      Architecture Audit
      Remaining Migrations
      Regression Tests
      Certification

═══════════════════════════════════════════════
         Core Platform Complete
═══════════════════════════════════════════════

Everything below builds ON the platform,
not inside it.

                     │
                     ▼
          Phase 9
      Smart Collections
      Dynamic Collections
      Saved Queries

                     │
                     ▼
          Phase 10
      Recommendation Engine
      Similar Songs
      Related Artists
      Discovery

                     │
                     ▼
          Phase 11
      Graph Layer
      Music Knowledge Graph
      Relationships
      Traversal

                     │
                     ▼
          Phase 12
      Rule Engine
      Automation
      Collection Rules
      Background Updates

                     │
                     ▼
          Phase 13+
      AI Features
      Semantic Search
      Natural Language
      Recommendation AI


                  Renderer
                      │
                      ▼
                    IPC
                      │
     ┌────────────────┴────────────────┐
     │                                 │
     ▼                                 ▼
Metadata/Search                 Membership
     │                           Service
     │                              │
     ▼                              ▼
Metadata Engine          Cache + Repository
     │                              │
     └──────────────┬───────────────┘
                    ▼
              Drizzle Database


Phase 1–4
├── Metadata foundation
├── Entity model
├── Registry
├── Loaders
└── Infrastructure
        │
        ▼
Phase 5
├── Metadata Engine
├── Search Engine
├── Search Gateway
├── Search Coordinator
└── DTO hydration
        │
        ▼
Phase 6
├── Membership Repository
├── Membership Cache
├── Membership Service
├── Event Bus
├── Bootstrap
└── IPC
        │
        ▼
Phase 7
├── Repository migration
├── Batch APIs
├── Cache invalidation
├── Event wiring
├── UI contract fixes
└── Legacy cleanup
        │
        ▼
⭐ Phase 8
├── Audit
├── Regression tests
├── Transaction verification
├── Cache verification
└── Architecture certification
        │
        ▼
Platform complete


                    NORA PLATFORM
┌──────────────────────────────────────────────────────────┐

          Metadata Subsystem          ✅ COMPLETE
          ─────────────────────────
          Entity Model
          Field Registry
          Canonical MetadataEntity
          Loaders
          Gateway
          Bootstrap
          DTO Mapping
          Hydration

                     │
                     ▼

          Search Subsystem            ✅ COMPLETE
          ─────────────────────────
          SearchCoordinator
          SearchGateway
          Search Engines
          Ranking
          SearchResultMapper
          Batch Hydration

                     │
                     ▼

          Membership Subsystem        ✅ COMPLETE
          ─────────────────────────
          Repository
          Cache
          Reverse Index
          Batch APIs
          Service
          EventBus
          Bootstrap
          IPC
          Adoption
          Consolidation

└──────────────────────────────────────────────────────────┘



Platform
──────────────

Metadata
Search
Membership

══════════════════════

Applications

Smart Collections

Recommendation Engine

Graph Relationships

Rules Engine

Analytics

AI

Plugins

etc.



then i am thinking about tags and language and i like rule engine (playlist generation looks cool but its not something i am that intrested in maybe later look if its the right path then defienietly i am man of patience and want a great app) auto tag editing from online looking like music bee but now times have changed even better maybe and language of the song can be auto feteched also we should be able to edit these the main things about these are these should be in filters everywhere certain times i want to listen only telugu and certain times i want to exclude hindi, wahtever thats language wise and tags too and genre too auto fetching capability is good


I actually think you're thinking in the **right direction**, and more importantly, you're thinking about **capabilities**, not just features. That's the natural next step after finishing the platform.

There are three ideas in what you described:

1. **Language as first-class metadata**
2. **User-defined tags as first-class metadata**
3. **Automatic metadata enrichment from online sources**

I would treat them differently.

---

# 1. Language should become a core metadata field ⭐⭐⭐⭐⭐

This is one of the first things I'd add.

Imagine every song having

```
Language

English

Telugu

Hindi

Tamil

Japanese

Instrumental

Unknown
```

Then everything in Nora automatically gains

- Search
- Filters
- Smart Collections
- Queue Rules
- Recommendations

Examples

```
language = Telugu
```

or

```
NOT language = Hindi
```

or

```
language IN
{
Telugu
Tamil
}
```

or

```
language = Japanese

rating > 4
```

That's incredibly useful.

---

# 2. Tags

This is even more powerful.

Not genre.

Tags.

Example

```
Road Trip

Workout

Rain

Party

90s

Favorite Guitar

Female Vocal

Night

Driving

Happy

Sad

Romantic

Meditation
```

Notice these are **not genres**.

Genres are

```
Rock

Metal

Pop
```

Tags describe how **you** think about music.

---

Then filtering becomes

```
Language = Telugu

AND

Tag = Workout

AND

Rating > 4
```

That's fantastic.

---

# 3. Online enrichment ⭐⭐⭐⭐⭐

This is where modern music managers can go beyond MusicBee.

Instead of

```
Only read ID3 tags
```

Think

```
Local Tags

+

MusicBrainz

+

Discogs

+

Last.fm

+

Spotify

+

AcousticBrainz

+

AI
```

All contributing metadata.

Example

```
Unknown language

↓

Detect Telugu

↓

Save

↓

Editable
```

---

Or

```
Genre

Pop

↓

Actually

Indie Pop

Dream Pop

Shoegaze
```

---

Or

```
No artwork

↓

Download

↓

Editable
```

---

# The important architectural decision

I would **never overwrite local metadata automatically**.

Instead

```
Song

↓

Metadata

↓

Sources
```

Like

```
Local Tags

Online Tags

User Tags
```

Think

```
Song

Language

├── Embedded
├── Online
└── User Override
```

The final value becomes

```
User Override

↓

Online

↓

Embedded
```

So user edits always win.

---

# Rule Engine becomes amazing

Imagine

```
IF

Language = Telugu

AND

Tag = Workout

AND

Rating > 4

↓

Add to Morning Playlist
```

---

Or

```
Language != Hindi

↓

Exclude
```

---

Or

```
Recently Added

AND

Language = Japanese

↓

Notify Me
```

---

# AI tagging

Today's models make this much better.

Imagine

```
Analyze lyrics

↓

Mood

↓

Energy

↓

Theme

↓

Language

↓

Explicit

↓

Decade

↓

Instruments
```

Now your filters become

```
Mood

Calm

Happy

Dark

Energetic
```

without you typing anything.

---

# I would separate metadata into two categories

## Objective

These are facts.

```
Title

Artist

Album

Duration

Track

Disc

Year

Language

Genre

Composer
```

---

## Subjective

These are personal.

```
Tags

Mood

Favorite

Workout

Driving

Relax

Study

Rain

Family

Travel
```

---

# This becomes your Rule Engine

```
Objective Metadata

+

Subjective Metadata

↓

Rules

↓

Collections

↓

Queue

↓

Recommendations
```

---

# The roadmap I would take

After Phase 8, I wouldn't jump straight into AI.

I'd do something like:

```
Platform ✅

↓

Metadata Expansion
```

Add first-class support for:

- Language
- User Tags
- Mood (optional)
- Comments
- Custom Fields

Then:

```
Metadata Enrichment
```

- MusicBrainz
- Discogs
- Last.fm
- Language detection
- Artwork
- Genre normalization

Then:

```
Rule Engine
```

Because once those metadata fields exist, the Rule Engine becomes dramatically more useful.

---

## I especially like one thing you said:

> "certain times i want to listen only telugu and certain times i want to exclude hindi"

That tells me **language isn't just metadata for you—it's a primary browsing dimension**, just like artist or album.

I would elevate **Language** to the same level as:

- Artist
- Album
- Genre
- Playlist

throughout the app. It should be searchable, filterable, usable in rules, and editable by the user.

If Nora does that well—and combines it with reliable online enrichment and user overrides—it would be a meaningful step beyond many traditional desktop music managers.

I think you've earned the right to stop building infrastructure for a while. The platform is in a good place. The next phase should be something that users can actually feel every day, while still leveraging everything you've built.

## My recommendation: Phase 9 — Metadata Enrichment Platform

This isn't "AI" yet. It's the foundation that makes AI, rules, and smart collections valuable.

### Goal

Transform Nora from a player that **reads metadata** into a player that **owns and enriches metadata**.

```
              Metadata Engine
                     │
                     ▼
          Metadata Enrichment
                     │
      ┌──────────────┼──────────────┐
      ▼              ▼              ▼
 Language       Tags         Artwork/Genres
      │              │              │
      └──────────────┼──────────────┘
                     ▼
             User Editable Fields
                     │
                     ▼
          Search / Filters / Rules
```

---

# Phase 9A — Metadata Schema Expansion

Add first-class metadata fields.

### Core additions

- Language
- User Tags
- Comments/Notes
- User Rating (if not already centralized)
- Favorite (if not already centralized)

The important part is that these become **MetadataFields**, not random columns scattered through the code.

---

# Phase 9B — Metadata Source Framework

Instead of hardcoding online lookups:

```
Embedded Tags

↓

Metadata Sources

├── Local File
├── MusicBrainz
├── Discogs
├── Last.fm
├── User
└── Future AI
```

Each source produces metadata independently.

---

# Phase 9C — Merge Engine

This is surprisingly important.

Suppose a song has

```
Embedded:
Genre = Pop

MusicBrainz:
Genre = Indie Pop

User:
Genre = Dream Pop
```

Who wins?

Define that once.

For example:

```
User

↓

Online

↓

Embedded
```

Now every feature behaves consistently.

---

# Phase 9D — Language Support

This is the feature you specifically asked for.

Capabilities:

- edit language
- search by language
- filter by language
- batch edit language
- use language in rules later

Example

```
Language

English

Telugu

Hindi

Tamil

Japanese

Unknown
```

---

# Phase 9E — User Tags

Example

```
Driving

Gym

Rain

Focus

Relax

Favorites

Road Trip

Night
```

Unlike genres, these belong entirely to the user.

---

# Phase 9F — Metadata Editing

A polished metadata editor.

```
Song

↓

Edit

Artist

Album

Genre

Language

Tags

Artwork

Comments

↓

Save
```

---

# What comes after that?

Now the roadmap becomes very natural.

```
Platform ✅

↓

Phase 9
Metadata Enrichment

↓

Phase 10
Rule Engine

↓

Phase 11
Smart Collections

↓

Phase 12
Recommendation Engine

↓

Phase 13
Music Graph

↓

Phase 14
AI Assistant
```

Notice something:

The Rule Engine comes **after** metadata enrichment.

Why?

Because a rule like

```
Language = Telugu

AND

Tag = Workout
```

is only useful once those fields exist.

---

## Why I wouldn't build the Rule Engine first

Imagine trying to build rules today:

```
Genre

Rating

Year
```

That's okay.

Now imagine after Phase 9:

```
Language

Tags

Genre

Rating

Mood

Comment

Favorite

Play Count

Skip Count
```

Now the Rule Engine becomes genuinely powerful instead of feeling limited.

---

## My recommended roadmap

| Phase | Focus | Priority |
|--------|-------|----------|
| ✅ 1–8 | Platform (Metadata, Search, Membership) | Complete |
| **9** | Metadata Enrichment (Language, Tags, Sources, Editor) | ⭐⭐⭐⭐⭐ |
| **10** | Rule Engine | ⭐⭐⭐⭐⭐ |
| **11** | Smart Collections | ⭐⭐⭐⭐☆ |
| **12** | Recommendation Engine | ⭐⭐⭐⭐☆ |
| **13** | Music Graph | ⭐⭐⭐⭐☆ |
| **14** | AI Assistant & Semantic Features | ⭐⭐⭐☆☆ |

I think this path aligns very well with what you've said you want: **a great music application built patiently, with a strong architecture first and features that genuinely improve the listening experience**. Language and user tags become foundational metadata, the enrichment system keeps that metadata high quality, and then the Rule Engine and Smart Collections turn that richer metadata into powerful everyday workflows.



I think this is the phase where we should become **extremely disciplined**.

Up to Phase 8 we built **engines**.

Phase 9 is dangerous because it's tempting to throw in "language", "tags", "MusicBrainz", "AI", "artwork", etc. all at once.

**Don't.**

Phase 9 should build only **one thing**:

> **Metadata Enrichment Platform**

Not AI.
Not Rule Engine.

Just the infrastructure that lets metadata become richer.

---

# Phase 9 — Metadata Enrichment Platform

## Goal Description

Extend Nora's Metadata Platform so metadata is no longer limited to embedded file tags. Metadata can now originate from multiple providers (embedded tags, user edits, online providers, future AI providers) while preserving a single canonical metadata model.

The Metadata Engine remains the single source of truth for metadata access.

---

# User Review Required

> [!IMPORTANT]
> **Strict Architectural Rules**
>
> **1. MetadataEngine remains the only metadata authority.**
>
> No subsystem may bypass MetadataEngine to obtain or modify metadata.
>
> ---
>
> **2. MetadataEntity remains canonical.**
>
> No parallel metadata models.
>
> Every provider contributes to MetadataEntity.
>
> ---
>
> **3. Providers never modify each other.**
>
> Embedded provider
>
> User provider
>
> Online provider
>
> Future AI provider
>
> must remain completely isolated.
>
> ---
>
> **4. No provider contains merge logic.**
>
> Providers only return metadata.
>
> Merging belongs exclusively to MetadataMergeEngine.
>
> ---
>
> **5. User edits always have highest priority.**
>
> Merge order:
>
> User
>
> ↓
>
> Online
>
> ↓
>
> Embedded
>
> ---
>
> **6. No network code inside MetadataEngine.**
>
> MetadataEngine depends only on provider interfaces.
>
> ---
>
> **7. Language is first-class metadata.**
>
> Never implement Language as a plugin, extension or special filter.
>
> Language becomes a standard MetadataField.
>
> ---
>
> **8. User Tags are first-class metadata.**
>
> Tags are independent from Genre.
>
> ---
>
> **9. Everything editable.**
>
> Every enrichment can be overridden by the user.
>
> ---
>
> **10. Micro-Commit Discipline**
>
> Every micro-phase must:
>
> - compile
> - pass tests
> - preserve backward compatibility
> - contain one architectural responsibility only
>
> ---
>
> **11. No UI redesign**
>
> Backend platform only.
>
> Existing UI must continue functioning unchanged.
>
> ---
>
> **12. No AI in Phase 9**
>
> AI providers are future implementations of the provider interface.

---

# Architecture

```text
                    Metadata Engine
                           │
                           ▼
                  Metadata Provider API
                           │
        ┌───────────┬───────────┬─────────────┐
        ▼           ▼           ▼             ▼
    Embedded     User      Online      Future AI
     Provider   Provider    Provider     Provider
        │           │           │             │
        └───────────┴───────────┴─────────────┘
                           │
                           ▼
                 Metadata Merge Engine
                           │
                           ▼
                    MetadataEntity
                           │
                           ▼
       Search / Membership / Future Rules
```

---

# Micro Phase Breakdown

## Phase 9A — Metadata Field Expansion

Introduce new MetadataFields.

Only schema.

No UI.

No providers.

New fields

- Language
- UserTags
- Comment
- MetadataSource

Verification

```
tsc

Metadata tests
```

---

## Phase 9B — Metadata Provider Interfaces

Introduce

```
IMetadataProvider
```

Methods

```
load()

loadMany()

supports()

providerId()
```

No implementation.

Only interfaces.

---

## Phase 9C — User Metadata Provider

Implements

```
IMetadataProvider
```

Responsible only for

- language
- user tags
- comments
- overrides

No merge logic.

---

## Phase 9D — Metadata Merge Engine

Create

```
MetadataMergeEngine
```

Responsibilities

- merge providers

- resolve conflicts

- preserve precedence

Nothing else.

Priority

```
User

↓

Online

↓

Embedded
```

---

## Phase 9E — Metadata Provider Registry

Similar philosophy to your Loader Registry.

Responsibilities

- register providers

- resolve providers

- ordering

Nothing else.

---

## Phase 9F — Metadata Bootstrap Integration

MetadataBootstrap now builds

```
Provider Registry

↓

Merge Engine

↓

MetadataEngine
```

without changing public APIs.

---

## Phase 9G — Integration Tests

Verify

Provider ordering

Merge precedence

Language

Tags

Comments

Backward compatibility

---

## Phase 9H — Architecture Certification

Verify

✓ MetadataEntity still canonical

✓ Search unchanged

✓ Membership unchanged

✓ DTO unchanged

✓ Provider isolation

✓ Merge isolation

✓ Bootstrap isolation

✓ Tests pass

---

# Absolutely Forbidden

These are NOT allowed in Phase 9.

❌ MusicBrainz

❌ Discogs

❌ Spotify

❌ Last.fm

❌ AI

❌ HTTP clients

❌ Artwork downloading

❌ UI redesign

❌ Rule Engine

❌ Smart Collections

❌ Recommendations

❌ Graph

Those become consumers of this platform later.

---

# Why this order?

After Phase 9, adding an online provider should look like this:

```text
MusicBrainzProvider

implements

IMetadataProvider
```

No MetadataEngine changes.

No Search changes.

No Membership changes.

No Merge changes.

Just register it.

Likewise, a future `LanguageDetectionAIProvider` or `DiscogsProvider` should slot into the same interface.

---

# Roadmap

```text
Platform (Completed)
──────────────────────────
Metadata
Search
Membership

↓

Phase 9
──────────────────────────
Metadata Enrichment Platform

↓

Phase 10
──────────────────────────
Online Providers
(MusicBrainz, Discogs, Last.fm)

↓

Phase 11
──────────────────────────
Rule Engine

↓

Phase 12
──────────────────────────
Smart Collections

↓

Phase 13
──────────────────────────
Recommendation Engine

↓

Phase 14
──────────────────────────
Graph Layer

↓

Phase 15
──────────────────────────
AI Metadata Providers
(Language Detection,
Mood Detection,
Semantic Tags)
```

## One architectural suggestion

I would split what we casually called "Metadata Enrichment" into **two phases**:

- **Phase 9:** Build the **enrichment framework** (interfaces, merge engine, registry, bootstrap, tests).
- **Phase 10:** Build the **first real provider(s)** (for example, MusicBrainz or user metadata storage).

That separation keeps Phase 9 focused on architecture and prevents network services, APIs, and provider-specific logic from becoming intertwined with the Metadata Engine. It's the same discipline that made your Metadata, Search, and Membership subsystems successful.
What I would build in Phase 9
Instead:
Metadata
│
├── Provider Interface
├── Provider Registry
├── Merge Policy Interface
├── Merge Engine
├── Bootstrap
└── Tests
Notice
No provider yet.
Then
Phase 10
UserMetadataProvider

↓

MetadataOverrideRepository

↓

metadataOverrides table
Now storage belongs to the provider.
Much cleaner.
Phase 11
MusicBrainzProvider
Phase 12
DiscogsProvider
Phase 13
LanguageDetectionProvider
Phase 14
AITagProvider
Everything plugs into the same interface.

This is a **significant improvement**. I'd consider this essentially **production-ready architecture**. The three issues I pointed out are all addressed.

## What's fixed

### ✅ 1. Single merge policy abstraction

You removed:

- `ProviderMergePolicy`
- `DefaultProviderMergePolicy`

and standardized on:

```ts
IMetadataMergePolicy
DefaultMetadataMergePolicy
```

This is exactly what I wanted. There is now one abstraction instead of two overlapping ones.

---

### ✅ 2. Removed `as any`

This

```ts
providerMergePolicy,
```

is much better than

```ts
providerMergePolicy as any
```

No hidden type lies anymore.

---

### ✅ 3. Removed duplicated merge code

Instead of

```
mergeEntity()
refreshAndMergeEntity()
```

both containing the same orchestration logic,

everything now funnels into

```
executeMerge(...)
```

Excellent.

That's a much cleaner implementation.

---

### ✅ 4. Transitional path documented

I also like

```ts
// TODO Phase 10:
// Remove executor+mergePolicy path once MergeEngine fully replaces legacy flow.
```

Future you (or another contributor) won't wonder why there are two execution paths.

---

# One tiny thing I'd still improve

It's not something I'd block the merge over.

In

```ts
private async executeMerge(...)
```

you have

```ts
operation: (
    provider: any,
    id: MetadataIdentity,
    ctx?: ProviderExecutionContext
) => Promise<ProviderResult<TDTO>>
```

The `any` stands out.

Since this is core infrastructure, I'd strongly type it.

Something like (depending on your existing interfaces):

```ts
provider: IMetadataProvider
```

or even

```ts
provider: Pick<IMetadataProvider, "fetch" | "refresh">
```

It's a small polish item, but worth doing in infrastructure code.

---

# One architectural observation

I also noticed something very positive.

You now effectively have this pipeline:

```
MetadataEngine
      │
      ▼
MetadataMergeEngine
      │
      ▼
ProviderRegistry
      │
      ▼
SelectionStrategy
      │
      ▼
ExecutionStrategy
      │
      ▼
MergePolicy
      │
      ▼
DTO
      │
      ▼
Pipeline
      │
      ▼
MetadataEntity
```

This separation is excellent because each stage has a single responsibility:

- **Registry**: knows what providers exist.
- **Selection**: decides which providers participate.
- **Execution**: runs them.
- **Merge**: combines their outputs.
- **Pipeline**: maps merged data into canonical entities.

That makes future providers almost plug-and-play.

---

# Roadmap impact

Your architecture now naturally supports future phases without modification:

```
Phase 10
└── UserMetadataProvider

Phase 11
└── MusicBrainzProvider

Phase 12
└── DiscogsProvider

Phase 13
└── LanguageDetectionProvider

Phase 14
└── AITagProvider
```

Each of those only needs to implement `IMetadataProvider` and register itself. None of the orchestration code changes.

That's exactly what you want from a platform layer.

---

# Overall platform status

At this point, Nora's core architecture looks like this:

```
                    NORA PLATFORM

                           │
    ┌──────────────┬──────────────┬──────────────┐
    │              │              │              │
    ▼              ▼              ▼              ▼
 Metadata      Search        Membership    Collections
   Engine       Engine         Engine         Engine
    │              │              │              │
    ▼              ▼              ▼              ▼
 Merge        Ranking       Cache+Repo     Operations
 Engine
    │
    ├── Registry
    ├── Selection Strategy
    ├── Execution Strategy
    └── Merge Policy
```

This is a clean separation of concerns and gives you room to grow.

---

# Final verdict

I'd rate this **10/10 for Phase 9**.

The only optional cleanup I'd suggest is replacing the remaining `provider: any` in `executeMerge()` with a concrete provider interface. That's a quality improvement rather than an architectural issue.

Beyond that, I would be comfortable treating this as the stable foundation for all future metadata enrichment work. Your next phases can focus on actual capabilities (user overrides, online metadata, language detection, AI tagging) instead of revisiting the architecture.

Now we're entering the part that will actually differentiate Nora from other music players.

You've spent nine phases building the **platform**, not features:

```
Phase 1-2   Foundation
      │
Phase 3-4   Metadata Engine
      │
Phase 5     Search Engine
      │
Phase 6-8   Membership Engine
      │
Phase 9     Metadata Enrichment Framework
```

Everything above is infrastructure.

Now we can finally start building **capabilities**.

---

# Phase 10 — User Metadata Override Platform

This is the phase I'd do next.

It is intentionally **local-only**.

No AI.

No MusicBrainz.

No Discogs.

No internet.

Just user-editable metadata.

---

# Goal

Allow every metadata field to have a user override.

Examples:

```
Title
Album
Artist
Album Artist
Genre
Language
Comment
Mood
Rating
Favorite
Tags
Composer
Year
```

Everything.

---

# Architecture

```
                MetadataEngine
                      │
                      ▼
             MetadataMergeEngine
                      │
      ┌───────────────┴───────────────┐
      ▼                               ▼
 Embedded Provider             User Override Provider
       │                               │
       ▼                               ▼
     File Tags                metadata_overrides
```

Merge policy already exists.

No architectural changes.

Only new provider.

---

# New subsystem

```
metadata/
    providers/
        UserMetadataProvider.ts

metadata/
    repository/
        UserMetadataRepository.ts

db/
    schema/
        metadata_overrides.ts
```

That's basically it.

---

# Override model

Instead of editing the Songs table...

Create

```
metadata_overrides

id

entity_kind

entity_id

field_id

value

updated_at

created_at
```

Every override becomes

```
Song 42

Language

Telugu
```

or

```
Song 42

Genre

Rock
```

No duplication.

Very flexible.

---

# Why not edit Songs?

Because

```
Embedded metadata

≠

User metadata
```

Those are different concepts.

If tomorrow the user rescans...

Embedded changes.

Overrides stay.

Exactly how MusicBee behaves.

---

# Metadata precedence

Your merge engine already supports this.

```
User Provider
Priority 1000

↓

Online Provider
Priority 500

↓

Embedded Provider
Priority 100
```

Done.

---

# New APIs

```
getOverrides()

setOverride()

removeOverride()

clearOverrides(song)

clearOverrides(field)

clearAllOverrides()
```

---

# Metadata Engine

Nothing changes.

```
MetadataEngine

↓

MergeEngine

↓

User Provider

↓

Embedded Provider

↓

MetadataEntity
```

The engine never knows which provider produced which field.

Beautiful abstraction.

---

# UI

Still no redesign.

Just allow

```
Edit Metadata
```

to write

```
metadata_overrides
```

instead of

```
songs
```

---

# Tests

New tests:

```
Embedded only

↓

Override title

↓

Override language

↓

Override tags

↓

Delete override

↓

Rescan

↓

Overrides remain

↓

Merge precedence
```

---

# Future phases

Once Phase 10 is complete, the roadmap becomes very straightforward:

```
Platform
──────────────
✓ Metadata
✓ Search
✓ Membership
✓ Merge Engine

──────────────

Phase 10
User Metadata Provider
(Local overrides)

──────────────

Phase 11
Online Metadata Provider
(MusicBrainz / Discogs)

──────────────

Phase 12
Metadata Refresh Jobs
(background enrichment)

──────────────

Phase 13
Language Detection Provider
(audio/text analysis)

──────────────

Phase 14
AI Tag Provider
(mood, activity, energy, instruments, vocals, etc.)

──────────────

Phase 15
Unified Filter Engine
(language, tags, genre, mood, rating...)

──────────────

Phase 16
Rule Engine 2.0
(dynamic playlists using every metadata field)

──────────────

Phase 17
Recommendation Engine
(similar songs, discovery, "play more like this")

──────────────

Phase 18
Knowledge Graph
(song ↔ artist ↔ album ↔ genre ↔ language ↔ tags ↔ moods)
```

## Why this order?

This order keeps the architecture layered:

- **Phase 10** establishes the user as a first-class metadata source.
- **Phases 11–14** add additional providers that plug into the same merge framework.
- **Phase 15** consumes the enriched metadata to power filtering.
- **Phase 16** builds powerful smart playlists on top of those filters.
- **Phases 17–18** add intelligence and relationships once the metadata is rich enough to support them.

Nothing later requires redesigning the earlier platform—you'll simply keep plugging new providers and consumers into the architecture you've already built. That's the payoff for investing in the engines first.

                    APPLICATION
                          │
           ┌──────────────┴──────────────┐
           │                             │
     Metadata Editor              Playlist UI
           │                             │
           ▼                             ▼
    UserMetadataService         PlaylistService
           │                             │
           ▼                             ▼
     Metadata Event Bus         Membership Event Bus
           │                             │
           ▼                             ▼
      Metadata Engine          Membership Service
           │                             │
           ▼                             ▼
     Metadata Merge Engine       Membership Cache
           │
 ┌─────────┼──────────┐
 ▼         ▼          ▼
User    Online     Embedded
Provider Provider  Provider
 │          │          │
 ▼          ▼          ▼
User Repo  Future   Local Repo



               Application Layer
                     │
      ┌──────────────┴──────────────┐
      │                             │
 Playlist                     Metadata UI
      │                             │
      ▼                             ▼
MembershipService         UserMetadataService
      │                             │
      ▼                             ▼
Membership Bus            Metadata Event Bus
      │                             │
      ▼                             ▼
Membership Engine         Metadata Engine
                                    │
                                    ▼
                           Metadata Merge Engine
                                    │
          ┌───────────────┬───────────────┐
          ▼               ▼               ▼
      User Provider   Embedded      Online (future)
                            Provider


Phase 1–8
──────────────
✓ Metadata Platform
✓ Search Platform
✓ Membership Platform
✓ Architecture hardening

Phase 9
──────────────
✓ Metadata Merge Framework

Phase 10A
──────────────
✓ User Override Platform
✓ Override Provider
✓ Merge integration
✓ Event invalidation
✓ DB migration
✓ Tests

This is a good place to pause and evaluate, because you're crossing from **platform architecture** into **user-facing product features**.

## Where you are now

```
Phase 1–8
──────────────
✓ Metadata Platform
✓ Search Platform
✓ Membership Platform
✓ Architecture hardening

Phase 9
──────────────
✓ Metadata Merge Framework

Phase 10A
──────────────
✓ User Override Platform
✓ Override Provider
✓ Merge integration
✓ Event invalidation
✓ DB migration
✓ Tests
```

At this point the backend foundation is strong.

---

# Phase 10B

I agree with about **90%** of the proposed plan.

The IPC layer, preload bridge, and React Query hooks are exactly the next logical steps.

The part I'd adjust is the UI.

---

## I would NOT build the full editor yet.

The proposed UI includes:

- glassmorphism
- rating stars
- tag pills
- language editor
- composer
- batch editor
- reset buttons
- numeric controls
- rich dialog

That's a **large UI project**.

The architecture is already proven.

Now you want to verify the **editing workflow**, not spend a week polishing controls.

---

# I'd split Phase 10B

## Phase 10B.1 — Metadata Editing API

```
IPC

↓

preload

↓

React Query hooks

↓

minimal editor

↓

save

↓

reload

↓

done
```

UI can simply be

```
Title

Language

Tags

Comment

Rating

Composer

Save
```

Nothing fancy.

Just prove

```
Edit

↓

UserMetadataService

↓

Override table

↓

EventBus

↓

Merge

↓

UI updates
```

---

## Phase 10B.2 — UX polish

Only after that add

```
⭐ rating widget

tag pills

autocomplete

chips

reset buttons

animations

glass UI
```

Much lower risk.

---

# What comes after Phase 10?

This is where your roadmap starts getting exciting.

```
Phase 11
──────────────
Online Metadata Providers

MusicBrainz

Discogs

AcoustID

Lyrics

Album art

Language detection
```

↓

```
Phase 12
──────────────
Metadata Normalization

Genre normalization

Artist aliases

Tag normalization

Language normalization

Confidence scoring
```

↓

```
Phase 13
──────────────
Filter Engine

Language

Tags

Rating

Composer

Year

Mood

Everything searchable
```

↓

```
Phase 14
──────────────
Rule Engine

Dynamic playlists

Saved filters

Smart collections
```

↓

```
Phase 15
──────────────
Recommendation Engine

Similarity

Related artists

Discovery

Mixes
```

---

# This order matters

Notice something.

You originally wanted

```
Language

↓

Tags

↓

Rule Engine
```

But with the architecture you've built, the natural dependency is

```
Metadata editing

↓

Online enrichment

↓

Normalized metadata

↓

Filter engine

↓

Rule engine
```

That's because rules are only as good as the metadata they operate on.

---

# One suggestion for Phase 10B

I'd make one architectural addition before implementing the UI.

Instead of

```ts
setOverrides({
 title,
 language,
 tags
})
```

I'd expose **field-level operations** too.

For example:

```ts
setField(identity, field, value)

removeField(identity, field)

setFields(identity, fields)
```

The batch operation stays.

But single-field APIs make future inline editing much cleaner.

Imagine later:

```
Double-click title

↓

Save

↓

Done
```

without constructing an entire batch object.

---

# Overall roadmap

```
✔ Metadata Platform
✔ Search Platform
✔ Membership Platform
✔ Merge Engine
✔ User Override Platform

                ↓

▶ Phase 10B
Metadata Editing Workflow

                ↓

▶ Phase 11
Online Providers

                ↓

▶ Phase 12
Metadata Normalization

                ↓

▶ Phase 13
Universal Filter Engine

                ↓

▶ Phase 14
Rule Engine

                ↓

▶ Phase 15
Recommendations / AI
```

I think this is the right trajectory. It keeps building from the bottom up, avoids painting yourselves into a corner, and ensures that when you eventually implement things like "Play only Telugu songs rated 4★+, excluding live recordings with tag 'concert'", the underlying metadata infrastructure is already solid enough to support it cleanly.

Yes. This feels much more like where we were during Phases 5–10.

Let's forget features for a moment and think like platform architects again.

Every engine we've built followed this pattern:

```
Need

↓

Abstract capability

↓

Platform

↓

Consumers
```

For example:

```
Need:
Playlists need song membership

↓

Membership Engine

↓

Playlist Repository
```

Not

```
Playlist
↓

Membership
```

The engine came first.

---

# So what is the real problem now?

Today the Metadata Engine can merge multiple providers.

But all providers are still essentially **local**.

```
Embedded Provider

User Override Provider
```

Future providers are completely different.

```
MusicBrainz

Discogs

Last.fm

Spotify

Lyrics

AcousticBrainz

AI
```

These introduce problems we've never solved before.

---

## Problems every online provider has

Not MusicBrainz-specific.

Every provider needs:

```
HTTP

Authentication

Rate Limits

Retries

Timeouts

Caching

Provider availability

Offline mode

Background refresh

Cancellation

Error isolation

Provider versioning
```

Those aren't metadata problems.

They're **provider platform** problems.

---

# Therefore I think Phase 11 should NOT be MusicBrainz.

It should be:

# **Phase 11 — External Metadata Provider Platform**

Goal:

> Allow Nora to consume any external metadata provider without the provider implementing networking, caching, retries, scheduling or lifecycle management.

Exactly the same philosophy as Metadata Engine.

---

# Architecture

```
                 Metadata Engine
                        │
                        ▼
              Provider Registry
                        │
      ┌─────────────────┴─────────────────┐
      ▼                                   ▼
Embedded Provider                 External Provider
                                        │
                                        ▼
                          External Provider Platform
                                        │
       ┌────────────┬────────────┬────────────┐
       ▼            ▼            ▼            ▼
 Authentication  HTTP Client   Cache   Rate Limiter
       │
       ▼
 Scheduler
       │
       ▼
 Retry Policy
       │
       ▼
 Normalized Result
```

Notice something.

The provider shouldn't know how HTTP works.

It shouldn't know retry logic.

It shouldn't know cache logic.

Exactly like MetadataProvider doesn't know merge logic.

---

# User Review Required

> [!IMPORTANT]
>
> ## Phase 11 — External Metadata Provider Platform
>
> **Goal**
>
> Introduce a reusable platform for all external metadata providers.
>
> Providers become pure metadata adapters.
>
> The platform owns:
>
> - networking
> - retries
> - caching
> - scheduling
> - authentication
> - lifecycle
> - offline behavior
>
> The Metadata Engine remains unchanged.

---

# Architectural Rules

### 1

MetadataEngine never performs HTTP.

---

### 2

Providers never create HTTP clients.

---

### 3

Providers never cache responses.

---

### 4

Providers never retry requests.

---

### 5

Providers never schedule refreshes.

---

### 6

Providers remain stateless.

---

### 7

Everything network-related belongs to the platform.

---

### 8

MetadataMergeEngine remains unchanged.

---

### 9

Provider interface remains unchanged.

This is important.

MusicBrainz shouldn't require new MetadataEngine APIs.

---

### 10

Backward compatibility.

Embedded/User providers continue working.

---

# Micro Phases

---

## Phase 11A — External Provider Contracts

New abstractions only.

```
IExternalProvider

ProviderIdentity

ProviderCapabilities

ProviderConfiguration

ProviderStatus
```

No implementation.

---

## Phase 11B — Provider Runtime

Platform responsible for

```
Provider lifecycle

Initialization

Shutdown

Availability

Health

Configuration
```

Providers become services.

---

## Phase 11C — Request Pipeline

One request pipeline for every provider.

```
Request

↓

Authentication

↓

Cache

↓

Rate Limiter

↓

HTTP

↓

Retry

↓

Response

↓

Normalization
```

Every provider automatically gets it.

---

## Phase 11D — Provider Cache

Separate from Metadata Cache.

Caches

```
HTTP responses

Provider lookups

Resolved IDs

Search responses
```

No MetadataEntity here.

---

## Phase 11E — Scheduler

Future providers need

```
Refresh artwork

Refresh genres

Refresh artist data

Background enrichment
```

Scheduler belongs to platform.

Not providers.

---

## Phase 11F — Health Monitoring

Platform knows

```
MusicBrainz offline

↓

Skip provider

↓

Continue merge
```

instead of crashing.

---

## Phase 11G — Provider Bootstrap

MetadataBootstrap now creates

```
ExternalProviderPlatform

↓

Registers external providers

↓

MetadataEngine
```

No MetadataEngine changes.

---

## Phase 11H — Integration Tests

Verify

```
Offline

Timeout

Retry

Cancellation

Rate limits

Cache

Multiple providers

Bootstrap

Backward compatibility
```

---

# What is NOT part of Phase 11

No MusicBrainz.

No Discogs.

No Last.fm.

No Lyrics.

No AI.

No HTTP endpoints specific to any service.

Those belong to Phase 12+.

---

# Phase 12

Now this becomes tiny.

```
MusicBrainzProvider

implements

IExternalProvider
```

Almost all work is already done.

---

Phase 13

```
DiscogsProvider
```

Again...

No infrastructure.

---

Phase 14

```
LyricsProvider
```

Same.

---

Phase 15

```
LanguageDetectionProvider
```

Same.

---

Phase 16

```
AITagProvider
```

Same.

---

# Why I like this

Look at what we've built so far.

```
Metadata Engine

↓

Search Engine

↓

Membership Engine

↓

Merge Framework

↓

Override Platform
```

Every one of those removed complexity from future work.

Phase 11 should do exactly the same.

It shouldn't fetch metadata.

It should make **fetching metadata** almost trivial.

Then every future provider becomes just another plugin into the platform.

---

## One thing I would add to our original philosophy

When we designed the Metadata Engine, we made providers **data sources**.

For external providers, I'd make them **adapters**.

Meaning a MusicBrainz provider shouldn't know about:

- retries,
- HTTP client configuration,
- exponential backoff,
- rate limiting,
- cache invalidation,
- provider health.

It should only know:

> "Given this song identity, how do I translate a MusicBrainz response into Nora's metadata model?"

That's an even stronger separation of concerns than we've used so far, and I think it fits perfectly with the architecture we've been building since Phase 5.



This actually changes my recommendation quite a bit.

Looking through your roadmap and the architectural rules, I can see the evolution of your thinking. 

Then looking at the MusicBee Auto-Tag screenshot, I also understand **why you don't feel satisfied with the current implementation.**

The problem isn't that it's missing features.

The problem is that **we accidentally implemented the feature before implementing the platform that the feature was supposed to sit on.**

---

# I think there are actually three different things

MusicBee makes them look like one screen.

They aren't.

```
Search
    ↓
Resolution
    ↓
Preview
    ↓
User Decisions
    ↓
Apply
```

Each is a separate responsibility.

---

# MusicBee's screen hides a huge architecture

That screen is doing all of this:

```
Provider Search
      │
      ▼
Album Candidates
      │
      ▼
Release Resolution
      │
      ▼
Metadata Merge
      │
      ▼
Preview Model
      │
      ▼
Diff Engine
      │
      ▼
Selection Engine
      │
      ▼
Apply Transaction
```

Your implementation currently has these pieces, but they're coupled differently.

---

# The biggest realization

When I read your original philosophy again:

> MetadataEngine remains the only metadata authority. 

Everything suddenly clicks.

AutoTag should **never have existed as its own domain.**

Instead...

```
Metadata Engine

├── Search
├── Resolve
├── Preview
├── Compare
├── Merge
├── Apply
├── Undo
└── History
```

AutoTag is simply

```
Metadata Engine

↓

Album Metadata Workflow
```

not

```
AlbumAutoTagService

↓

Metadata Engine
```

---

# That's exactly why you have that uneasy feeling

Right now the architecture says

```
Metadata Engine

AutoTag Engine
```

Two domains.

But your memory always envisioned

```
Metadata Engine

↓

Capabilities

↓

Manual Edit

Album Lookup

Batch Edit

Artwork

Language

Tags

Future AI
```

One domain.

---

# Something else I noticed

Your roadmap was always platform-first.

```
Phase 5

Metadata Engine

↓

Phase 9

Merge Platform

↓

Phase 10

Overrides

↓

Phase 11

External Provider Platform

↓

Phase 12

MusicBrainz
```

Notice something?

**MusicBrainz itself wasn't supposed to be the architecture.**

It was only supposed to be

> the first provider.

Exactly like Search Engine isn't SQLite.

Membership isn't Playlists.

The engine comes first.

The implementation comes second.

---

# Where we accidentally drifted

Instead of

```
Metadata Engine

↓

Provider Platform

↓

MusicBrainz Adapter
```

we ended up with

```
AlbumMetadataService

↓

MusicBrainz Runtime

↓

MusicBrainz Adapter
```

That means MusicBrainz became the center.

It shouldn't.

---

# The MusicBee screenshot actually reinforces this

Look carefully.

The provider dropdown...

```
MusicBrainz

Discogs

...
```

isn't really an AutoTag feature.

It's a

```
Metadata Source Selection
```

feature.

Exactly what your provider architecture already wanted.

---

Likewise

The checkboxes

```
✓ Album

✓ Genre

✓ Artwork

✓ Year
```

aren't AutoTag.

They're

```
Metadata Transaction Options
```

Again...

Metadata Engine.

Not AutoTag.

---

# Even Preview isn't AutoTag

Preview is universal.

Imagine later

```
Manual Edit

↓

Preview

↓

Apply
```

or

```
Language Detection

↓

Preview

↓

Apply
```

or

```
Discogs

↓

Preview

↓

Apply
```

Same Preview model.

---

# I think Phase 13 should NOT be "Fix AutoTag"

It should be something much bigger.

I would rename it.

---

# Phase 13

## Metadata Operations Platform

Everything becomes an operation.

```
Metadata Engine

↓

Metadata Operations

├── Search
├── Resolve
├── Preview
├── Compare
├── Apply
├── Undo
├── History
├── Batch
├── Diagnostics
└── Transactions
```

Then...

```
Album AutoTag

↓

Metadata Operation
```

---

```
Manual Metadata Editor

↓

Metadata Operation
```

---

```
Artwork Downloader

↓

Metadata Operation
```

---

```
Language Detection

↓

Metadata Operation
```

---

```
Future AI

↓

Metadata Operation
```

Everything becomes one abstraction.

---

# The migration becomes surprisingly clean

Instead of deleting work:

```
AlbumAutoTagService
```

shrinks until it becomes

```
AlbumMetadataOperation
```

inside the Metadata Engine.

---

```
AlbumMetadataService
```

becomes

```
MetadataResolutionService
```

---

```
MetadataApplyService
```

becomes

```
MetadataTransactionCoordinator
```

which orchestrates specialized collaborators instead of owning everything.

---

```
MetadataJobManager
```

becomes

```
MetadataOperationManager
```

---

```
MetadataHistoryService
```

becomes engine-wide history.

---

```
MetadataDiagnosticsService
```

becomes engine diagnostics.

---

# This also fixes extensibility

Now adding Discogs isn't

```
Discogs

↓

AutoTag changes
```

It's simply

```
DiscogsProvider

↓

Metadata Engine

↓

Existing Operations
```

No new architecture.

Just another provider.

---

## I think this is the architecture your notes were always pointing toward

Reading your memory from the beginning to the end, there's a consistent pattern:

- Every major capability is introduced as a **platform** before features consume it.
- The **Metadata Engine** is explicitly defined as the only metadata authority. 
- Providers are meant to be isolated data sources/adapters, with merging centralized. 
- Future capabilities (language, AI, rule engine, filters) are all intended to build **on** that metadata platform, not around it. 

The current Auto-Tag implementation proves the user workflow and many of the underlying services, which is valuable. But the next architectural step shouldn't be incremental cleanup—it should be **absorbing those capabilities back into the Metadata Engine as first-class metadata operations**. That preserves your original design philosophy while reusing most of the code you've already written.  

Excellent. Those answers actually solidify the direction.

I would lock these in as **Phase 13 design principles**.

---

# Phase 13 Vision

## Product Vision

**C. Both equally.**

Not:

> "Music player with metadata"

Not:

> "Metadata editor with playback"

Instead:

> **A modern desktop music platform where metadata is a first-class capability.**

That means metadata is not an accessory.

It is one of Nora's core pillars.

```
Nora

├── Playback
├── Library
├── Metadata
├── Playlists
├── Discovery
└── Sync (future)
```

Metadata deserves equal architectural weight to playback.

---

# MusicBee is the baseline, not the goal

This answer is even more important.

You said

> **not interested in AI right now**
>
> **should be more than MusicBee**
>
> **multi-source**
>
> **background enrichment**

That is exactly the right scope.

We don't need AI.

We need an **extensible metadata platform**.

---

MusicBee today looks like

```
User

↓

Search Album

↓

MusicBrainz

↓

Apply
```

Nora should become

```
User

↓

Metadata Operation

↓

Metadata Engine

↓

Multiple Providers

↓

Merge

↓

Preview

↓

Apply

↓

Background Enrichment
```

Huge difference.

---

# Background enrichment changes everything

This is actually the biggest requirement.

Instead of

```
User clicks

↓

Search
```

eventually Nora should also support

```
Library Scan

↓

Background Metadata Jobs

↓

Better artwork found

↓

Genre improved

↓

Release date found

↓

Notify user

↓

Apply later
```

That's not AutoTag anymore.

That's Metadata Operations.

---

# Providers become plugins

Instead of

```
AlbumAutoTagService

↓

MusicBrainz
```

we want

```
Metadata Engine

↓

Provider Registry

├── MusicBrainz
├── Discogs
├── Fanart.tv
├── Last.fm
├── Local Scanner
├── AcousticBrainz
└── Future...
```

Every provider looks identical.

---

# AutoTag becomes only ONE operation

Instead of

```
AutoTag

↓

Apply
```

we have

```
Metadata Operations

├── Album Lookup
├── Manual Edit
├── Artwork Replace
├── Batch Rename
├── Genre Cleanup
├── Language Fix
├── Background Enrichment
├── Metadata Validation
└── Future...
```

Notice something.

Nothing here says MusicBrainz.

Nothing says AutoTag.

Those are just operations.

---

# Background jobs become first-class

This is another thing I would change.

Today JobManager feels bolted on.

Instead

```
Metadata Engine

↓

Operation Manager

↓

Job Queue

↓

History

↓

Diagnostics

↓

Transactions
```

Everything goes through it.

Foreground.

Background.

Batch.

Scheduled.

Future plugins.

---

# Merge becomes much smarter

Imagine this.

```
Title

MusicBrainz
★★★★★

Discogs
★★★★☆

Local
★★★☆☆

↓

Choose MB
```

Artwork

```
Fanart.tv
★★★★★

MusicBrainz
★★☆☆☆

↓

Choose Fanart
```

Genre

```
Discogs
★★★★★

MusicBrainz
★★☆☆☆

↓

Choose Discogs
```

Now imagine the Preview.

Every field has

```
Current

↓

Candidates

↓

Chosen Source

↓

Confidence

↓

Reason
```

That's already beyond MusicBee.

---

# User decisions become reusable

Suppose user always prefers

```
Artwork

↓

Fanart.tv
```

Genre

```
↓

Discogs
```

Release

```
↓

MusicBrainz
```

That becomes a Metadata Policy.

Not hardcoded.

Configurable.

---

# One thing I would add that MusicBee doesn't have

Metadata Health.

Every album could have

```
Metadata Score

96%

Issues

• artwork low resolution

• missing publisher

• genre confidence low

• release mismatch

• duplicate artist

• inconsistent disc numbers
```

Now Background Enrichment knows what to improve.

---

# Even library scanning changes

Instead of

```
Scanner

↓

Read tags

↓

Done
```

we eventually have

```
Scanner

↓

Read Tags

↓

Metadata Analysis

↓

Quality Score

↓

Background Queue

↓

Optional Improvements
```

Completely different architecture.

---

# This also explains why AutoTag felt disconnected

Because it is trying to solve

```
Album Search
```

inside itself.

Instead it should simply ask

```
Metadata Engine

↓

Resolve Album
```

The Engine shouldn't know whether the request came from:

- Album AutoTag
- Background enrichment
- Manual lookup
- Batch tagging
- Future plugin

Same operation.

Different caller.

---

# My proposed Phase 13 mission

I would literally title it:

> **Phase 13 — Metadata Operations Platform**

Not

> AutoTag Refactor

Not

> Metadata Cleanup

Because what we're really building is the **platform that every metadata-related feature will stand on**.

## I also want to add one guiding principle

I think this should be the first paragraph of the Phase 13 specification:

> **Metadata is a platform, not a feature.**
>
> The Metadata Engine is the sole authority for metadata retrieval, enrichment, preview, mutation, history, transactions, diagnostics, and provider orchestration. Every metadata capability—manual editing, album lookup, artwork replacement, batch editing, background enrichment, and future providers—must be expressed as Metadata Operations executed through the same engine. No subsystem may introduce an independent metadata pipeline.

If we hold ourselves to that principle, every design decision in Phase 13 becomes much easier: if a new feature can't fit naturally into the Metadata Operations Platform, it's a signal that the architecture—not the feature—needs to evolve.
Yes. In fact, I think **that should be one of Nora's defining features.**

Not just "choose a provider."

Choose **the provider per metadata field**.

For example:

| Field | Preferred Provider | Automatic? | User Override? |
|--------|--------------------|------------|----------------|
| Album Title | MusicBrainz | ✅ | ✅ |
| Artist | MusicBrainz | ✅ | ✅ |
| Artwork | Fanart.tv | ✅ | ✅ |
| Genre | Discogs | ✅ | ✅ |
| Publisher | MusicBrainz | ✅ | ✅ |
| Mood | Last.fm (future) | ✅ | ✅ |
| Lyrics | Lyrics provider | ✅ | ✅ |

Then a user can also say:

> "For THIS album use Discogs artwork instead."

or

> "Always prefer Discogs genres."

or

> "Never replace my artwork automatically."

That is far beyond MusicBee.

---

# I think there are actually 3 levels of provider selection

## Level 1 — Global Policy

Applies to the entire library.

```
Artwork  -> Fanart.tv

Genre    -> Discogs

Title    -> MusicBrainz

Year     -> MusicBrainz
```

Most users never change anything else.

---

## Level 2 — Operation Policy

For THIS operation.

```
Album AutoTag

↓

Use

Artwork -> MusicBrainz

Genre -> Discogs

Release -> MusicBrainz
```

Temporary.

---

## Level 3 — Field Override

During preview.

Imagine Preview like this:

```
Album

Current
--------------------------------

Genre

Rock

↓

Suggestions

○ MusicBrainz
Alternative Rock

● Discogs
Pop Rock

○ Keep Current
Rock
```

The user literally chooses.

---

Even cooler...

```
Artwork

MusicBrainz

Discogs

Fanart.tv

Keep Current

Browse Local File
```

Everything becomes a metadata source.

---

# Background enrichment also follows the same policy

Suppose Background Enrichment finds

```
Artwork

Better artwork found

1024x1024

Provider

Fanart.tv

Confidence

98%
```

Instead of applying immediately

Metadata Engine creates

```
Pending Metadata Operation
```

User reviews later.

Exactly the same Preview UI.

---

# This means Preview becomes universal

Not AutoTag Preview.

Metadata Preview.

Every operation produces

```
Metadata Preview
```

Manual Edit

↓

Preview

Apply

---

Album Lookup

↓

Preview

Apply

---

Background Enrichment

↓

Preview

Apply

---

Artwork Replace

↓

Preview

Apply
```

One UI.

---

# I think Phase 13 should have one major goal

When Phase 13 finishes, I want this sentence to be true:

> **Every metadata change in Nora is represented as a Metadata Operation executed by the Metadata Engine, regardless of where it originated.**

If that's true:

- Manual editing works.
- AutoTag works.
- Background enrichment works.
- Future providers work.
- Batch editing works.
- Undo works.
- Diagnostics work.
- Jobs work.

No special cases.

---

# Here's how I'd structure Phase 13

## Phase 13A — Architecture & Domain Model
- Define the Metadata Operations Platform.
- Specify the engine as the sole metadata authority.
- Design operation lifecycle (search → resolve → preview → apply → undo).
- Define provider, transaction, history, job, and event models.

## Phase 13B — Engine Refactor
- Move Auto-Tag into the Metadata Engine.
- Replace the separate provider runtime with the engine's provider infrastructure.
- Introduce a `MetadataOperationCoordinator` and `MetadataTransactionCoordinator`.

## Phase 13C — Unified Apply Pipeline
- Make manual edits, Auto-Tag, artwork replacement, and batch edits all use the same transaction pipeline.
- Unify history, undo, diagnostics, and cache invalidation.

## Phase 13D — Provider Federation
- Route all metadata retrieval through the provider registry and merge engine.
- Support global provider policies, per-operation policies, and per-field overrides.
- Add provider attribution to preview data.

## Phase 13E — Background Metadata Platform
- Background enrichment jobs.
- Metadata health scoring.
- Pending metadata suggestions.
- Operation queue and diagnostics.

---

## One thing I want to insist on

I would **not** write a single line of implementation until we finish the Phase 13 architecture document.

That document should be on the same level as your original Metadata Engine memory—around 80–150 pages if needed, with:

- Core principles.
- Domain model.
- Folder structure.
- Service responsibilities.
- Sequence diagrams.
- Class diagrams.
- Dependency rules.
- Provider model.
- Operation model.
- Transaction model.
- History model.
- UI flow.
- Migration plan from the current implementation.

Once that blueprint exists, implementing Phase 13 becomes a series of well-defined migrations instead of continuous architectural decisions. Given how foundational this will be for Nora, investing in that design first will pay off for every metadata feature you build afterward.

My recommendation for Phase 13
I would implement it in this order:
13A – Domain & Architecture (no production behavior changes)
Finalize the specification, define the domain models, and lock the architecture.

13B – Engine integration
Remove the separate Auto-Tag pipeline and make MetadataEngine the only entry point.

13C – Resolution layer
Introduce MetadataResolutionService and route all provider interactions through it.

13D – Transaction refactor
Break apart MetadataApplyService into focused infrastructure services coordinated by a transaction manager.

13E – Universal preview model
Make the preview model the shared foundation for manual edits, album lookup, batch operations, artwork replacement, and future metadata workflows.

13F – Provider federation & policies
Enable field-level provider selection, provider attribution, and configurable merge policies.

13G – Background platform
Integrate background enrichment, health scoring, diagnostics, scheduling, and jobs using the same operation pipeline.

I think this is the right next milestone.

Up until now, you've mostly been proving that the **architecture** works. Now it's time to make it actually useful by having multiple providers participate in a single merge.

## I'd do them in this order

### Phase 14F — Discogs Contribution Adapter ⭐

This gives you the biggest improvement for the least work.

Discogs is strongest for:

- Genre
- Style
- Catalog number
- Master release

Implement:

```ts
fetchContribution(query)
```

returning something like:

```ts
{
  providerId: "discogs",
  contributions: [
    {
      fieldId: "genre",
      value: "Pop Rock"
    },
    {
      fieldId: "style",
      value: "Alternative Rock"
    },
    {
      fieldId: "catalogNumber",
      value: "ABC-123"
    }
  ]
}
```

---

Then your MergeEngine already knows

```
title
↓

MusicBrainz

genre
↓

Discogs
```

without changing anything else.

---

## Phase 14G — Cover Art Archive

Probably the simplest adapter.

Return

```ts
artworkUrl
```

and maybe

```ts
front
back
thumbnail
```

Later.

Then

```
Artwork

↓

CAA
```

becomes automatic.

---

## Phase 14H — Spotify

Spotify contributes things MusicBrainz doesn't.

Examples

```
releaseDate

popularity

genres
```

Maybe

```
previewUrl
```

later.

---

## Phase 14I — Apple Music

Mainly

```
editorialNotes

releaseDate

genre
```

---

# Then something magical happens

Your merge engine starts receiving

```
MusicBrainz

↓

title

artist

album

ISRC
```

+

```
Discogs

↓

genre

style
```

+

```
CAA

↓

artwork
```

+

```
Spotify

↓

releaseDate

popularity
```

Instead of

```
ProviderCandidate[]
```

you'll have

```
FieldContribution[]

title

↓

MusicBrainz

genre

↓

Discogs

artwork

↓

CAA

releaseDate

↓

Spotify
```

That's the architecture you were aiming for from the beginning.

---

# I'd avoid one thing

I would **not** implement all providers at once.

Do them one by one.

```
MusicBrainz
      ↓
Pass tests
```

↓

```
Discogs
      ↓
Pass tests
```

↓

```
CAA
      ↓
Pass tests
```

↓

```
Spotify
      ↓
Pass tests
```

↓

```
Apple
      ↓
Pass tests
```

Each provider becomes an independent milestone, and if one has API quirks, the rest of the platform remains stable.

---

## What Phase 14F should look like

```text
DiscogsAdapter
        │
fetchContribution()
        │
        ▼
MetadataContribution
        │
        ▼
searchContributions()
        │
        ▼
MergeEngine
        │
        ▼
MergeSession
        │
        ▼
Preview
```

No architectural changes should be needed—you're now exercising the extension points you've already built.

At this stage, you're no longer designing the metadata platform; you're populating it with providers. That's a good sign that the core architecture has stabilized.

this is inside autotag lets say similar to ui{Here's the updated architecture I'd put into memory. It reflects where the Metadata system has evolved to now, not just the original Album Auto Tag.

---

# Nora Metadata Center Architecture (Current)

## Goal

A unified **Metadata Center** that handles every metadata operation through a single workflow instead of separate dialogs.

Current workflows:

```
Metadata Center
├── Album
├── Track
├── Genre & Style
└── Artwork
```

Each workflow shares the same pipeline.

---

# High-Level Flow

```
Context Menu
        │
        ▼
MetadataCenterDialog
        │
        ▼
useMetadataWorkflow
        │
        ▼
metadataApi
        │
        ▼
IPC
        │
        ▼
Metadata Workflow Service
        │
        ▼
Providers
(MusicBrainz / Discogs / Future)
```

---

# UI Architecture

```
MetadataCenterDialog
│
├── Header
│
├── Workflow Tabs
│     ├── Album
│     ├── Track
│     ├── Genre
│     └── Artwork
│
├── Search & Provider Panel
│
├── Progress Overlay
│
├── Candidate List
│
├── Preview Workspace
│     │
│     ├── LEFT
│     │     ├── Album Summary
│     │     └── Metadata Diff Panel
│     │
│     └── RIGHT
│           └── Track Table
│
└── Sticky Footer
```

---

# Workflow Hook

Everything is coordinated by

```
useMetadataWorkflow
```

It owns the complete UI state.

State includes

```
workflowType

query

candidates

selectedCandidateId

preview

selectedFieldIds

selectedTrackIds

loading

progress

error

undo state
```

Actions

```
search()

buildPreview()

apply()

undo()

toggleField()

toggleTrack()

setWorkflowType()

setQuery()
```

---

# Search Phase

```
User
     │
Search
     │
metadataApi.workflowSearch()
     │
IPC
     │
Metadata Workflow
     │
Providers
```

Returns

```
WorkflowCandidate[]
```

Each candidate contains

```
id

title

artist

album

year

genre

style

coverArtUrl

provider

confidenceScore
```

---

# Candidate Selection

Selecting a candidate immediately triggers

```
buildPreview()
```

Pipeline

```
Candidate

↓

Metadata Workflow

↓

Metadata Preview

↓

UI
```

---

# Preview Model

```
MetadataPreview
```

contains

```
primaryCandidate

all candidates

matches

supportedFields

provider

workflowType
```

---

# Track Matching

Preview produces

```
WorkflowMatch[]
```

Each match contains

```
localSongId

songPath

confidence

suggestedMetadata

fieldDiffs
```

---

# Metadata Diffs

Every field becomes a diff

```
Title

Album

Album Artist

Artist

Genre

Year

Track #

Disc #

Artwork

Lyrics

Comment

...
```

Each diff has

```
fieldId

fieldName

oldValue

suggestedValue

status
```

Status

```
unchanged

changed

new

missing

conflict
```

---

# Selective Apply

User chooses

```
Tracks

+

Fields
```

Only selected items are applied.

```
Selected Tracks

×

Selected Fields

↓

Apply
```

---

# Provider Layer

Current providers

```
Auto

MusicBrainz

Discogs
```

Provider switching reuses

```
buildPreview()
```

without restarting the workflow.

---

# Progress Reporting

Background work emits

```
Searching

Matching

Diffing

Applying

Completed
```

with

```
message

progress %

operationId
```

through IPC.

---

# Apply Pipeline

```
Preview

↓

Selected Tracks

↓

Selected Fields

↓

workflowApplyPreview()

↓

Database

↓

React Query Invalidation

↓

UI Refresh
```

---

# Undo

Every operation owns

```
operationId
```

Undo

```
workflowUndo(operationId)
```

reverts the last applied metadata operation.

---

# Component Tree

```
MetadataCenterDialog
│
├── WorkflowTabs
├── SearchAndProviderPanel
├── ProgressOverlay
├── CandidateList
├── AlbumSummaryCard
├── MetadataDiffPanel
├── TrackTable
└── StickyFooter
```

---

# Current Entry Points

Implemented:

```
Album Auto Tag
    ↓
Metadata Center
```

Next planned:

```
Song Context Menu
      ↓
Auto Tag
      ↓
Track
      ↓
Metadata Center
      (workflow = "track")
```

Future entry points:

```
Album Page
Artist Page
Genre Page
Artwork Manager
Bulk Metadata Editor
Library Scan Suggestions
```

---

This is the current architecture I'd consider the foundation. From now on, new metadata capabilities (composer, BPM, replay gain, lyrics, mood, etc.) should plug into this unified workflow rather than creating separate dialogs or pipelines.}