import { db } from '@main/db/db';
import { getAllSongs as getAllSavedSongs, getPlayableSongById } from '@main/db/queries/songs';
import { metadataOverrides } from '@main/db/schema';
import { convertToSongData } from '@main/utils/convert';
import { and, eq, inArray } from 'drizzle-orm';

import logger from '../logger';

type SongArtwork = NonNullable<
  NonNullable<Awaited<ReturnType<typeof getPlayableSongById>>>['artworks'][number]['artwork']
>;
export const parsePaletteFromArtworks = (
  artworks: (Partial<SongArtwork> | { path: string; id: number })[]
): PaletteData | undefined => {
  const artworkWithPalette = artworks.find(
    (artwork): artwork is SongArtwork => 'palette' in artwork && Boolean(artwork.palette)
  );

  if (artworkWithPalette) {
    const palette: PaletteData = { paletteId: String(artworkWithPalette.palette?.id) };

    if (artworkWithPalette.palette && artworkWithPalette.palette.swatches.length > 0) {
      for (const swatch of artworkWithPalette.palette.swatches) {
        switch (swatch.swatchType) {
          case 'DARK_VIBRANT':
            palette.DarkVibrant = {
              hex: swatch.hex,
              population: swatch.population,
              hsl: [swatch.hsl.h, swatch.hsl.s, swatch.hsl.l]
            };
            break;
          case 'LIGHT_VIBRANT':
            palette.LightVibrant = {
              hex: swatch.hex,
              population: swatch.population,
              hsl: [swatch.hsl.h, swatch.hsl.s, swatch.hsl.l]
            };
            break;
          case 'DARK_MUTED':
            palette.DarkMuted = {
              hex: swatch.hex,
              population: swatch.population,
              hsl: [swatch.hsl.h, swatch.hsl.s, swatch.hsl.l]
            };
            break;
          case 'LIGHT_MUTED':
            palette.LightMuted = {
              hex: swatch.hex,
              population: swatch.population,
              hsl: [swatch.hsl.h, swatch.hsl.s, swatch.hsl.l]
            };
            break;
          case 'MUTED':
            palette.Muted = {
              hex: swatch.hex,
              population: swatch.population,
              hsl: [swatch.hsl.h, swatch.hsl.s, swatch.hsl.l]
            };
            break;
          case 'VIBRANT':
            palette.Vibrant = {
              hex: swatch.hex,
              population: swatch.population,
              hsl: [swatch.hsl.h, swatch.hsl.s, swatch.hsl.l]
            };
            break;
        }
      }
    }

    return palette;
  }

  return undefined;
};

const getAllSongs = async (
  sortType = 'aToZ' as SongSortTypes,
  filterType?: SongFilterTypes,
  paginatingData?: PaginatingData,
  trx: DB | DBTransaction = db
) => {
  const songsData = await getAllSavedSongs(
    {
      start: paginatingData?.start ?? 0,
      end: paginatingData?.end ?? 0,
      filterType,
      sortType
    },
    trx
  );

  const result: PaginatedResult<AudioInfo, SongSortTypes> = {
    data: [],
    total: 0,
    sortType,
    start: 0,
    end: 0
  };

  if (songsData && songsData.data.length > 0) {
    const fetchedSongIds = songsData.data.map((s) => String(s.id));
    const languageMap = new Map<number, string>();

    if (fetchedSongIds.length > 0) {
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
            inArray(metadataOverrides.entityId, fetchedSongIds)
          )
        );

      for (const override of languageOverrides) {
        const sId = Number(override.entityId);
        if (!isNaN(sId) && override.stringValue) {
          languageMap.set(sId, override.stringValue);
        }
      }
    }

    result.data = songsData.data.map((song) => convertToSongData(song, languageMap.get(song.id)));

    result.total = songsData.data.length;
    result.start = songsData.start;
    result.end = songsData.end;
  }

  logger.debug(`Sending data related to all the songs`, {
    sortType,
    filterType,
    start: songsData.start,
    end: songsData.end
  });
  return result;
};

export default getAllSongs;
