/**
 * Monotonic staleness signal for library-derived projections (canonical All Songs queue).
 *
 * Bumped ONLY on structural song events that can change the set/order of song IDs in the library
 * view. Pure metadata events (artworks, palette, lyrics, listening data) do not affect the
 * projection and are ignored.
 *
 * See docs/canonical-queue-architecture.md — Invariant 7.
 */

const STRUCTURAL_LIBRARY_EVENT_TYPES: ReadonlySet<DataUpdateEventTypes> = new Set([
  'songs',
  'songs/newSong',
  'songs/updatedSong',
  'songs/deletedSong',
  'blacklist/songBlacklist'
] as DataUpdateEventTypes[]);

let libraryVersion = 0;

export function getLibraryVersion(): number {
  return libraryVersion;
}

export function bumpLibraryVersion(): number {
  libraryVersion += 1;
  return libraryVersion;
}

/** Bumps the version if any of the given data-update events is a structural song event. */
export function notifyLibraryStructureChanged(events: DataUpdateEvent[]): boolean {
  let bumped = false;
  for (const event of events) {
    if (STRUCTURAL_LIBRARY_EVENT_TYPES.has(event.dataType)) {
      if (!bumped) {
        bumpLibraryVersion();
        bumped = true;
      }
    }
  }
  return bumped;
}

export function isStructuralLibraryEvent(dataType: DataUpdateEventTypes): boolean {
  return STRUCTURAL_LIBRARY_EVENT_TYPES.has(dataType);
}
