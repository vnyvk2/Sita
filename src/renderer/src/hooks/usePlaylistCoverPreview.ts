import { useMemo } from 'react';

import type { ResolvedPlaylistCover } from '../types/playlistCover';
import type { MaterializedCoverDraft } from '../types/playlistCoverDraft';
import { resolvePlaylistCoverFromDraft } from '../utils/resolvePlaylistCover';

type Params = {
  draft: MaterializedCoverDraft;
  playlistSongs?: SongData[];
};

export function usePlaylistCoverPreview({
  draft,
  playlistSongs = []
}: Params): ResolvedPlaylistCover {
  return useMemo(() => {
    return resolvePlaylistCoverFromDraft(draft, playlistSongs);
  }, [draft, playlistSongs]);
}
