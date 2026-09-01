# 08. Architecture Decision Records (ADR)

This document records the foundational architectural decisions, contexts, and consequences governing Nora's Metadata Platform.

---

## ADR-001: `MetadataEngine` is the Single Metadata Authority

- **Status**: Accepted
- **Context**: Gen1 metadata query paths were fragmented across multiple ad-hoc services, leading to inconsistent cache states and race conditions.
- **Decision**: Establish `MetadataEngine` as the single internal authority for metadata entity state, identity resolution, and cache invalidation.
- **Consequences**: All internal entity read/write queries route through `MetadataEngine`; direct database table queries outside repositories are forbidden.

---

## ADR-002: Provider Resilience Isolation via `MetadataProviderExecutor`

- **Status**: Accepted
- **Context**: Direct HTTP calls to MusicBrainz, Discogs, and Cover Art Archive risked unhandled rate-limit failures (HTTP 429) and network timeouts blocking the main Electron thread.
- **Decision**: Enforce 100% routing of external provider calls through `MetadataProviderExecutor`, wrapping requests in Circuit Breakers, Rate Limiters, Retry Policies, and Timeout Policies.
- **Consequences**: External outages or rate limits are safely intercepted without crashing application UI; provider diagnostics are centrally logged.

---

## ADR-003: `MetadataTransactionManager` Owns All File & DB Writes

- **Status**: Accepted
- **Context**: File tagging and database state updates were previously scattered across IPC handlers and application services, making rollback on write failure impossible.
- **Decision**: Centralize all write operations under `MetadataTransactionManager` as the transaction coordinator, enforcing Option A (whole-transaction atomic all-or-nothing) rollback semantics.
- **Consequences**: Write failures or cancellation mid-transaction automatically revert disk files and SQLite database records to pre-transaction states.

---

## ADR-004: Single Composition Root via `MetadataBootstrap`

- **Status**: Accepted
- **Context**: Ad-hoc service instantiation inside `ipc.ts` caused duplicated networking pipelines, multiple rate limiters, and untraceable lifecycle ownership.
- **Decision**: Consolidate all service construction and dependency injection inside a single composition root: `MetadataBootstrap`.
- **Consequences**: `ipc.ts` performs 0 service constructions; dependencies are cleanly injected into structured container namespaces (`application`, `resolution`, `transactions`, `infrastructure`).

---

## ADR-005: Field-Based Query Intent Over Provider-Specific APIs

- **Status**: Accepted
- **Context**: AutoTag searches previously bound UI workflows directly to provider-specific endpoints (`searchMusicBrainz Releases`).
- **Decision**: Shift to field-based resolution intent (`resolve(fields: title, artist, album, genre, artworkUrl)`).
- **Consequences**: AutoTag workflows operate on abstract field metadata intents, allowing multi-provider federation (MusicBrainz for track structure, Discogs for genres/styles, Cover Art Archive for artwork) seamlessly.
