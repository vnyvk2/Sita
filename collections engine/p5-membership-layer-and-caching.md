# Phase 5 — Membership Layer & In-Memory Caching

## Objective
Implement a high-speed in-memory membership index to answer "is song X in collection Y?" in $O(1)$ constant time without querying the database.

## Components Created
- `src/main/collections/membership/MembershipService.ts`
- `src/main/collections/membership/MembershipCache.ts`
- `src/main/collections/membership/types.ts`
- `src/main/collections/membership/sources/PlaylistMembershipSource.ts`

## Key Architecture Contracts
- **`MembershipCache`**: In-memory data structure storing bidirectional maps: `collectionToSongs: Map<CollectionId, Set<SongId>>` and `songToCollections: Map<SongId, Set<CollectionId>>`.
- **`MembershipService.isMember(collectionId, songId)`**: Instant $O(1)$ membership check method.
- **`PlaylistMembershipSource`**: Data provider interface populating the cache on system startup or after bulk operations.

## Features & Technical Behavior
1. **$O(1)$ Lookups**: Enables UI components (e.g. favorite icons, playlist indicator badges) to query song membership status instantaneously.
2. **Selective Invalidation**: Updates only affected collection or song keys when entries are added or removed, avoiding expensive full-cache rebuilds.
3. **Reactive IPC Integration**: Fires granular membership update events over IPC when track bindings change.
