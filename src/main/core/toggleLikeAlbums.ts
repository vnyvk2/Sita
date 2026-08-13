import { db } from '@main/db/db';
import { getAlbumFavoriteStatus, updateAlbumFavoriteStatus } from '@main/db/queries/albums';

import logger from '../logger';
import { dataUpdateEvent } from '../main';

const toggleLikeAlbums = async (albumIds: number[], isLikeAlbum?: boolean) => {
  const albums = await getAlbumFavoriteStatus(albumIds);
  const result: ToggleLikeSongReturnValue = {
    likes: [],
    dislikes: []
  };

  logger.debug(
    `Requested to ${
      isLikeAlbum === undefined ? 'toggle like' : isLikeAlbum ? 'like' : 'dislike'
    } albums with ids -${albumIds.join(', ')}-`
  );
  if (albums.length > 0) {
    const favoriteGroupedAlbums = Object.groupBy(albums, (album) =>
      album.isFavorite ? 'favorite' : 'notFavorite'
    );

    await db.transaction(async (trx) => {
      if (favoriteGroupedAlbums.favorite) {
        const status = isLikeAlbum ?? false;
        const dislikedAlbumIds = favoriteGroupedAlbums.favorite.map((a) => a.id);
        await updateAlbumFavoriteStatus(dislikedAlbumIds, status, trx);
        result.dislikes.push(...dislikedAlbumIds);
      }

      if (favoriteGroupedAlbums.notFavorite) {
        const status = isLikeAlbum ?? true;
        const likedAlbumIds = favoriteGroupedAlbums.notFavorite.map((a) => a.id);
        await updateAlbumFavoriteStatus(likedAlbumIds, status, trx);
        result.likes.push(...likedAlbumIds);
      }
    });

    dataUpdateEvent('albums/likes', [...result.likes, ...result.dislikes]);
    return result;
  }
  return result;
};

export default toggleLikeAlbums;
