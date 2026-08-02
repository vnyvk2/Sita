import type { MaterializedCoverDraft } from '../types/playlistCoverDraft';

export function isDraftEqual(
  original: MaterializedCoverDraft,
  current: MaterializedCoverDraft
): boolean {
  if (original.type !== current.type) return false;
  if (original.autoStrategy !== current.autoStrategy) return false;
  if (original.layout !== current.layout) return false;
  if (original.variant !== current.variant) return false;
  if (original.size !== current.size) return false;

  if (original.slots.length !== current.slots.length) return false;
  for (let i = 0; i < original.slots.length; i++) {
    if (original.slots[i].songId !== current.slots[i].songId) return false;
  }

  return true;
}
