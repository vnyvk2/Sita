import {
  getAlbumRelatedQueueInfo,
  getArtistRelatedQueueInfo,
  getFolderRelatedQueueInfo,
  getGenreRelatedQueueInfo,
  getPlaylistRelatedQueueInfo,
  getSongRelatedQueueInfo
} from '@main/db/queries/queue';
import {
  addDefaultAppProtocolToFilePath,
  getPlaylistArtworkPath,
  parseSongArtworks
} from '@main/fs/resolveFilePaths';

const addFileUrlToPath = (path?: string) => {
  if (!path) return '';
  return addDefaultAppProtocolToFilePath(path);
};

export const getQueueInfo = async (
  queueType: QueueTypes,
  id: string
): Promise<QueueInfo | undefined> => {
  switch (queueType) {
    case 'songs': {
      const parsedId = Number(id);
      if (id !== '' && !isNaN(parsedId)) {
        const data = await getSongRelatedQueueInfo(parsedId);
        const artworks = data?.artworks.map((a) => a.artwork) || [];
        const artworkData = parseSongArtworks(artworks);

        return {
          artworkPath: addFileUrlToPath(artworkData.artworkPath),
          title: data?.title || ''
        };
      }
      return { artworkPath: '', title: 'All Songs' };
    }
    case 'artist': {
      const parsedId = Number(id);
      if (isNaN(parsedId)) return { artworkPath: '', title: '' };
      const data = await getArtistRelatedQueueInfo(parsedId);
      return {
        artworkPath: addFileUrlToPath(data?.artworks.at(0)?.artwork?.path),
        title: data?.name || ''
      };
    }
    case 'album': {
      const parsedId = Number(id);
      if (isNaN(parsedId)) return { artworkPath: '', title: '' };
      const data = await getAlbumRelatedQueueInfo(parsedId);
      return {
        artworkPath: addFileUrlToPath(data?.artworks.at(0)?.artwork?.path),
        title: data?.title || ''
      };
    }
    case 'playlist': {
      const parsedId = Number(id);
      if (isNaN(parsedId)) return { artworkPath: '', title: '' };
      const data = await getPlaylistRelatedQueueInfo(parsedId);
      return {
        artworkPath: addFileUrlToPath(data?.artworks.at(0)?.artwork?.path),
        title: data?.name || ''
      };
    }
    case 'genre': {
      const parsedId = Number(id);
      if (isNaN(parsedId)) return { artworkPath: '', title: '' };
      const data = await getGenreRelatedQueueInfo(parsedId);
      return {
        artworkPath: addFileUrlToPath(data?.artworks.at(0)?.artwork?.path),
        title: data?.name || ''
      };
    }
    case 'folder': {
      const parsedId = Number(id);
      if (isNaN(parsedId)) return { artworkPath: '', title: '' };
      const data = await getFolderRelatedQueueInfo(parsedId);
      return {
        artworkPath: '',
        title: data?.name || ''
      };
    }

    case 'favorites': {
      const artwork = getPlaylistArtworkPath('Favorites', false);
      return {
        artworkPath: artwork.artworkPath,
        title: 'Favorites'
      };
    }

    case 'history': {
      const artwork = getPlaylistArtworkPath('History', false);
      return {
        artworkPath: artwork.artworkPath,
        title: 'History'
      };
    }

    default:
      return undefined;
  }
};
