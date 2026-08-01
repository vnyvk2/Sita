import type { PlaylistDto } from '@main/collections/ipc/dtos';
import { useMemo } from 'react';
import type { PlaylistCoverDraft, ResolvedPlaylistCover } from '../types/playlistCover';
import { resolvePlaylistCover } from '../utils/resolvePlaylistCover';

type Params = {
  draft: PlaylistCoverDraft;
  playlist: PlaylistDto;
};

export function usePlaylistCoverPreview({ draft, playlist }: Params): ResolvedPlaylistCover {
  return useMemo(() => {
    return resolvePlaylistCover(playlist, draft.currentSettings, draft.workingSongs);
  }, [playlist, draft.currentSettings, draft.workingSongs]);
}
