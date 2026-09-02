import { db } from '@main/db/db';
import { getAllSongs } from '@main/db/queries/songs';
import { metadataOverrides } from '@main/db/schema';
import { convertToSongData } from '@main/utils/convert';
import { and, eq, inArray } from 'drizzle-orm';

import logger from '../logger';

const getSongInfo = async (
  songIds: number[],
  sortType?: SongSortTypes,
  filterType?: SongFilterTypes,
  limit = songIds.length,
  preserveIdOrder = false,
  noBlacklistedSongs = false,
  trx: DB | DBTransaction = db
): Promise<SongData[]> => {
  logger.debug(`Fetching song data from getSongInfo`, {
    songIdsLength: songIds.length,
    sortType,
    limit,
    preserveIdOrder,
    noBlacklistedSongs
  });
  if (songIds.length > 0) {
    const songsDataResponse = await getAllSongs(
      {
        sortType,
        filterType,
        songIds: songIds.map((id) => Number(id)),
        preserveIdOrder
      },
      trx
    );

    const songsData = songsDataResponse.data;

    if (Array.isArray(songsData) && songsData.length > 0) {
      const fetchedSongIds = songsData.map((s) => String(s.id));
      const languageMap = new Map<number, string>();

      if (fetchedSongIds.length > 0) {
        const OVERRIDE_CHUNK_SIZE = 500;
        for (let i = 0; i < fetchedSongIds.length; i += OVERRIDE_CHUNK_SIZE) {
          const chunk = fetchedSongIds.slice(i, i + OVERRIDE_CHUNK_SIZE);
          const languageOverrides = await trx
            .select({
              entityId: metadataOverrides.entityId,
              stringValue: metadataOverrides.stringValue
            })
            .from(metadataOverrides)
            .where(
              and(
                eq(metadataOverrides.entityKind, 'song'),
                eq(metadataOverrides.fieldId, 'language'),
                inArray(metadataOverrides.entityId, chunk)
              )
            );

          for (const override of languageOverrides) {
            const sId = Number(override.entityId);
            if (!isNaN(sId) && override.stringValue) {
              languageMap.set(sId, override.stringValue);
            }
          }
        }
      }

      let updatedResults: SongData[] = songsData.map((x) =>
        convertToSongData(x, languageMap.get(x.id))
      );

      if (noBlacklistedSongs)
        updatedResults = updatedResults.filter((result) => !result.isBlacklisted);

      return updatedResults;
    }
    logger.error(`Failed to get songs info from get-song-info function. songs data are empty.`);
    return [];
  }
  logger.warn(`App made a request to get-song-info function with an empty array of song ids.`);
  return [];
};

export default getSongInfo;
