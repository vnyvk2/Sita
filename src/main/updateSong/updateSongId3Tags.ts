import { statSync } from 'fs';
import path from 'path';

import { ByteVector, Picture, PictureType } from 'node-taglib-sharp';
import sharp from 'sharp';

import { generateLocalArtworkBuffer } from '../filesystem/artworkBuffers';
export { generateLocalArtworkBuffer };

import { appPreferences } from '../../../package.json';
import { parseGenreList } from '../../common/genreUtils';
import parseLyrics from '../../common/parseLyrics';
import { updateCachedLyrics } from '../core/getSongLyrics';
import saveLyricsToLRCFile from '../core/saveLyricsToLrcFile';
import sendSongMetadata from '../core/sendSongMetadata';
import { db } from '../db/db';
import type { DB, DBTransaction } from '../db/db';
import { getUserSettings } from '../db/queries/settings';
import {
  updateSongModifiedAtByPath,
  getSongByPath,
  getSongById,
  updateSongBasicFields
} from '../db/queries/songs';
import { DEFAULT_FILE_URL } from '../filesystem';
import { removeDefaultAppProtocolFromFilePath } from '../fs/resolveFilePaths';
import { getArtistArtworkPath, getSongArtworkPath } from '../fs/resolveFilePaths';
import logger from '../logger';
import {
  dataUpdateEvent,
  getCurrentSongPath,
  getSongsOutsideLibraryData,
  sendMessageToRenderer,
  updateSongsOutsideLibraryData
} from '../main';
import { MetadataPendingWritesRepository } from '../metadata/history/MetadataPendingWritesRepository';
import { createTempArtwork, processArtworkFiles } from '../other/artworks';
import generatePalette from '../other/generatePalette';
import { syncSongRelationalData } from '../parseSong/syncSongRelationalData';
import { isSongBlacklisted } from '../utils/isBlacklisted';
import isPathAWebURL from '../utils/isPathAWebUrl';
import { withAtomicFileWrite } from '../utils/withAtomicFileWrite';
import { libraryScheduler } from '../workers/jobScheduler';

const { metadataEditingSupportedExtensions } = appPreferences;

export type TagData = {
  title?: string;
  artists?: string[];
  album?: string;
  /** Release-level artist (junction truth) - NOT derivable from track artists */
  albumArtist?: string;
  genres?: string[];
  composer?: string;
  trackNumber?: number;
  discNumber?: number;
  year?: number;
  artwork?: Picture;
  /**
   * Base64-encoded artwork for DEFERRED writes. The durable pending table is jsonb - a taglib
   * `Picture` instance cannot survive serialization there, so deferred intent travels as base64 and
   * is embedded at flush time (P0 #4: deferred writes must carry the complete physical file
   * intent).
   */
  artworkBase64?: string;
  lyrics?: string;
  musicBrainzRecordingId?: string;
  isrc?: string;
};

type PendingMetadataUpdates = {
  songPath: string;
  tags: TagData;
  sendUpdatedData?: boolean;
  isKnownSource?: boolean;
};

const pendingMetadataUpdates = new Map<string, PendingMetadataUpdates>();

export const isMetadataUpdatesPending = (songPath: string) => pendingMetadataUpdates.has(songPath);
export const clearPendingMetadataUpdates = () => pendingMetadataUpdates.clear();

export const savePendingMetadataUpdates = async (currentSongPath = '', forceSave = false) => {
  const { saveLyricsInLrcFilesForSupportedSongs } = await getUserSettings();

  if (pendingMetadataUpdates.size === 0)
    return logger.verbose('No pending metadata updates found.');

  logger.verbose(`Started saving pending metadata updates.`, {
    pendingSongs: pendingMetadataUpdates.keys
  });

  const entries = Array.from(pendingMetadataUpdates.entries());

  for (const [songPath, pendingMetadata] of entries) {
    const isACurrentlyPlayingSong = songPath === currentSongPath;

    if (forceSave || !isACurrentlyPlayingSong) {
      const pathExt = path.extname(songPath).replace(/\W/, '');
      const isASupportedFormat = metadataEditingSupportedExtensions.includes(pathExt);
      try {
        await withAtomicFileWrite(songPath, async (file) => {
          const { tags } = pendingMetadata;

          // Write metadata using node-taglib-sharp
          if (tags.title) file.tag.title = tags.title;
          if (tags.artists) file.tag.performers = tags.artists;
          if (tags.album) file.tag.album = tags.album;
          // Release-level album artist: explicit presence wins, including an
          // empty string meaning "clear" (mirrors TagWriterService semantics)
          if (tags.albumArtist !== undefined) {
            file.tag.albumArtists = tags.albumArtist ? [tags.albumArtist] : [];
          }
          if (tags.genres) file.tag.genres = tags.genres;
          if (tags.composer) file.tag.composers = [tags.composer];
          if (tags.trackNumber !== undefined) file.tag.track = tags.trackNumber;
          if (tags.discNumber !== undefined) file.tag.disc = tags.discNumber;
          if (tags.year !== undefined) file.tag.year = tags.year;
          if (tags.musicBrainzRecordingId !== undefined) {
            if (tags.musicBrainzRecordingId) {
              if (file.tag.musicBrainzTrackId) {
                file.tag.musicBrainzTrackId = '';
              }
              file.tag.musicBrainzTrackId = tags.musicBrainzRecordingId;
            } else if (file.tag.musicBrainzTrackId) {
              file.tag.musicBrainzTrackId = '';
            }
          }
          if (tags.isrc !== undefined) {
            if (tags.isrc) {
              file.tag.isrc = tags.isrc;
            } else if (file.tag.isrc) {
              file.tag.isrc = '';
            }
          }

          // Handle artwork
          if (tags.artwork) {
            file.tag.pictures = [tags.artwork];
          } else if (tags.artworkBase64) {
            // Deferred-write intent arrives jsonb-safe as base64; embed it as
            // a front-cover picture with the same pipeline as TagWriterService
            try {
              const rawBuffer = Buffer.from(tags.artworkBase64, 'base64');
              const jpegBuffer = await sharp(rawBuffer)
                .resize(1000, 1000, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 85 })
                .toBuffer();
              const picture = Picture.fromData(
                ByteVector.fromByteArray(new Uint8Array(jpegBuffer))
              );
              picture.mimeType = 'image/jpeg';
              picture.type = PictureType.FrontCover;
              picture.description = 'artwork';
              file.tag.pictures = [picture];
            } catch (artworkError) {
              logger.warn(`Failed to embed deferred artwork for '${songPath}'.`, { artworkError });
            }
          }

          // Handle lyrics - only unsynchronized (taglib-sharp doesn't support SYLT frames)
          if (tags.lyrics) {
            file.tag.lyrics = tags.lyrics;
          }

          // saved atomically by withAtomicFileWrite
        });

        // Save lyrics to LRC file if needed
        if (!isASupportedFormat || saveLyricsInLrcFilesForSupportedSongs) {
          const { title = '', lyrics } = pendingMetadata.tags;

          if (lyrics) {
            const parsedLyrics = parseLyrics(lyrics);
            if (parsedLyrics) {
              saveLyricsToLRCFile(songPath, {
                title,
                source: 'IN_SONG_LYRICS',
                isOfflineLyricsAvailable: true,
                lyricsType: parsedLyrics.isSynced ? 'SYNCED' : 'UN_SYNCED',
                lyrics: parsedLyrics
              });
            }
          }
        }

        logger.info(
          `Successfully saved pending metadata updates of '${pendingMetadata.tags.title}'.`,
          { songPath }
        );
        sendMessageToRenderer({
          messageCode: 'PENDING_METADATA_UPDATES_SAVED',
          data: { title: pendingMetadata.tags.title }
        });
        const songRecord = await getSongByPath(songPath);
        const affectedSongIds = songRecord?.id ? [songRecord.id] : [];

        dataUpdateEvent('songs/artworks', affectedSongIds);
        dataUpdateEvent('songs/updatedSong', affectedSongIds);
        dataUpdateEvent('artists');
        dataUpdateEvent('albums');
        dataUpdateEvent('genres');
        pendingMetadataUpdates.delete(songPath);
        void pendingWritesRepo.deleteBySongPath(songPath).catch(() => undefined);

        try {
          const stats = statSync(songPath);
          if (stats?.mtime) {
            const modifiedDate = stats.mtime.getTime();
            await updateSongModifiedAtByPath(songPath, new Date(modifiedDate));
            dataUpdateEvent('songs/updatedSong', affectedSongIds);
          }
        } catch (error) {
          logger.error(`FAILED TO GET SONG STATS AFTER UPDATING THE SONG WITH NEWER METADATA.`, {
            error
          });
        }
      } catch (error) {
        logger.error(`Failed to save pending metadata update of a song. `, { error, songPath });
        continue;
      }
    }
  }
  return undefined;
};

const mergeTagData = (base: TagData, incoming: TagData): TagData => {
  const merged: TagData = { ...base };
  if (incoming.title !== undefined) merged.title = incoming.title;
  if (incoming.artists !== undefined) merged.artists = incoming.artists;
  if (incoming.album !== undefined) merged.album = incoming.album;
  if (incoming.albumArtist !== undefined) merged.albumArtist = incoming.albumArtist;
  if (incoming.genres !== undefined) merged.genres = incoming.genres;
  if (incoming.composer !== undefined) merged.composer = incoming.composer;
  if (incoming.trackNumber !== undefined) merged.trackNumber = incoming.trackNumber;
  if (incoming.discNumber !== undefined) merged.discNumber = incoming.discNumber;
  if (incoming.year !== undefined) merged.year = incoming.year;
  if (incoming.artwork !== undefined) merged.artwork = incoming.artwork;
  if (incoming.artworkBase64 !== undefined) merged.artworkBase64 = incoming.artworkBase64;
  if (incoming.lyrics !== undefined) merged.lyrics = incoming.lyrics;
  if (incoming.musicBrainzRecordingId !== undefined)
    merged.musicBrainzRecordingId = incoming.musicBrainzRecordingId;
  if (incoming.isrc !== undefined) merged.isrc = incoming.isrc;
  return merged;
};

const addMetadataToPendingQueue = (data: PendingMetadataUpdates) => {
  // Coalesce field-by-field if a pending write already exists for this song
  const existing = pendingMetadataUpdates.get(data.songPath);
  if (existing) {
    pendingMetadataUpdates.set(data.songPath, {
      ...existing,
      ...data,
      tags: mergeTagData(existing.tags, data.tags)
    });
  } else {
    pendingMetadataUpdates.set(data.songPath, data);
  }

  const currentSongPath = getCurrentSongPath();

  const isACurrentlyPlayingSong = data.songPath === currentSongPath;
  if (!isACurrentlyPlayingSong) return savePendingMetadataUpdates(currentSongPath, true);

  return { deferred: true };
};
/**
 * Durable-pending storage for deferred metadata writes (2c P4 + P0 #1/#4). Split into two halves so
 * the orchestrator can commit the durable row inside its own DB transaction and hydrate the
 * coalescing queue only afterwards.
 */
const pendingWritesRepo = new MetadataPendingWritesRepository();

/**
 * P0 #1/#4: merges the incoming deferred intent with any already-durable row for this path and
 * upserts the FULL merged payload (optionally within a caller-owned transaction so it commits
 * atomically WITH the DB mutation).
 */
export const persistDeferredMetadataWrite = async (
  songPath: string,
  incomingTags: TagData,
  trx?: DB | DBTransaction
): Promise<void> => {
  const rows = await pendingWritesRepo.listAll(trx);
  const existing = rows.find((r) => r.songPath === songPath);
  const mergedTags = existing
    ? mergeTagData(existing.tags as unknown as TagData, incomingTags)
    : incomingTags;
  await pendingWritesRepo.upsert(
    {
      id: existing?.id ?? `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      songPath,
      tags: mergedTags as unknown as Record<string, unknown>,
      isKnownSource: true
    },
    trx ?? db
  );
};

/** Registers the intent in the in-memory coalescing queue WITHOUT touching durable state. */
export const enqueueDeferredMetadataInMemory = (songPath: string, tags: TagData): void => {
  const existing = pendingMetadataUpdates.get(songPath);
  if (existing) {
    pendingMetadataUpdates.set(songPath, {
      ...existing,
      songPath,
      tags: mergeTagData(existing.tags, tags),
      isKnownSource: true,
      sendUpdatedData: false
    });
  } else {
    pendingMetadataUpdates.set(songPath, {
      songPath,
      tags,
      isKnownSource: true,
      sendUpdatedData: false
    });
  }
};

/**
 * Boot-time recovery: replays any deferred writes persisted by a previous session. Called after DB
 * bootstrap; nothing is playing yet, so every item can be flushed immediately.
 */
export const restorePersistedPendingWrites = async (): Promise<void> => {
  const items = await pendingWritesRepo.listAll();
  if (items.length === 0) return;
  logger.info(`Restoring ${items.length} persisted pending metadata write(s).`);
  for (const item of items) {
    pendingMetadataUpdates.set(item.songPath, {
      songPath: item.songPath,
      tags: item.tags as unknown as TagData,
      isKnownSource: item.isKnownSource
    });
    // Hydrate ONLY - the durable row must survive until the flush actually
    // succeeds (savePendingMetadataUpdates deletes it on success). Deleting
    // here would permanently lose the write if the flush fails and the
    // process later exits (audit P0 #2).
  }
  await savePendingMetadataUpdates('', true);
};
export const fetchArtworkBufferFromURL = async (url: string) => {
  try {
    const res = await fetch(url);
    if (res.ok && res.body) return Buffer.from(await res.arrayBuffer());

    logger.warn(`Error occurred when fetching artwork from url.`, {
      status: res.status,
      statusText: res.statusText,
      url
    });

    return undefined;
  } catch (error) {
    logger.error('Error occurred when fetching artwork from url', { error, url });
    return undefined;
  }
};

const generateArtworkBuffer = async (artworkPath?: string) => {
  if (artworkPath) {
    const isArtworkPathAWebURL = isPathAWebURL(artworkPath || '');

    if (isArtworkPathAWebURL) {
      const onlineArtworkBuffer = await fetchArtworkBufferFromURL(artworkPath).catch((err) => {
        return logger.warn(`Failed to fetch online artwork buffer newly added to the song.`, {
          err,
          artworkPath
        });
      });
      return onlineArtworkBuffer;
    }
    const localArtworkBuffer = await generateLocalArtworkBuffer(artworkPath);
    return localArtworkBuffer;
  }
  return undefined;
};

const parseImgDataForNodeID3 = async (
  artworkPaths: ArtworkPaths,
  artworkBuffer?: Buffer | void
): Promise<Picture | undefined> => {
  if (artworkPaths.isDefaultArtwork) return undefined;

  if (artworkBuffer) {
    const pngBuffer = await sharp(artworkBuffer).toFormat('png').toBuffer();

    if (pngBuffer) {
      const picture = Picture.fromData(ByteVector.fromByteArray(new Uint8Array(pngBuffer)));
      picture.mimeType = 'image/png';
      picture.type = PictureType.FrontCover;
      picture.description = 'artwork';
      return picture;
    }
  }
  return undefined;
};

/* DEPRECATED - Old function not used in new implementation
const manageArtistDataUpdates = (
  artists: SavableArtist[],
  newSongData: SongTags,
  prevSongData: SavableSongData
) => {
  // these artists should be created as new artists.
  const artistsWithoutIds = Array.isArray(newSongData.artists)
    ? newSongData.artists.filter((artist) => typeof artist.artistId !== 'string')
    : [];
  // these artists are available in the library but may not be in the initial song data.
  const artistsWithIds = Array.isArray(newSongData.artists)
    ? newSongData.artists.filter((artist) => typeof artist.artistId === 'string')
    : [];
  //  these artists are available in the library and recently unlinked from the song.
  const unlinkedArtists =
    Array.isArray(artistsWithIds) && Array.isArray(prevSongData.artists)
      ? prevSongData.artists.length > 0 && artistsWithIds.length === 0
        ? prevSongData.artists
        : prevSongData.artists.filter(
            (a) => !artistsWithIds?.some((b) => a.artistId === b.artistId)
          )
      : [];
  // these artists are available in the library and already linked to the song.
  const linkedArtists =
    artistsWithIds.length > 0 && Array.isArray(prevSongData.artists)
      ? artistsWithIds.filter((a) => prevSongData.artists?.some((b) => a.artistId === b.artistId))
      : [];
  //  these artists are available in the library and recently linked to the song.
  const newlyLinkedArtists =
    artistsWithIds.length > 0 && Array.isArray(prevSongData.artists)
      ? artistsWithIds.filter((a) => !prevSongData.artists?.some((b) => a.artistId === b.artistId))
      : [];

  prevSongData.artists = [];

  if (artistsWithoutIds.length > 0) {
    logger.debug(`User created ${artistsWithoutIds.length} no of artists when updating a song.`, {
      artistsWithoutIds
    });
    for (let e = 0; e < artistsWithoutIds.length; e += 1) {
      const artistData = artistsWithoutIds[e];
      const songArtworkPaths = getSongArtworkPath(
        prevSongData.songId,
        prevSongData.isArtworkAvailable
      );
      const newArtist: SavableArtist = {
        artistId: generateRandomId(),
        name: artistData.name,
        songs: [{ songId: prevSongData.songId, title: prevSongData.title }],
        artworkName: songArtworkPaths.isDefaultArtwork
          ? undefined
          : path.basename(songArtworkPaths.artworkPath),
        isAFavorite: false
      };
      prevSongData?.artists.push({
        artistId: newArtist.artistId,
        name: artistData.name
      });
      artists.push(newArtist);
    }
  }
  if (unlinkedArtists.length > 0) {
    for (let i = 0; i < artists.length; i += 1) {
      if (
        unlinkedArtists.some((unlinkedArtist) => unlinkedArtist.artistId === artists[i].artistId)
      ) {
        if (artists[i].songs.length === 1 && artists[i].songs[0].songId === prevSongData.songId) {
          logger.debug(
            `'${artists[i].name}' got removed because user removed the only link it has with a song.`,
            { artistId: artists[i].artistId }
          );
          artists.splice(i, 1);
        } else {
          artists[i].songs = artists[i].songs.filter((s) => s.songId !== prevSongData.songId);
        }
      }
    }
  }
  if (linkedArtists.length > 0 || newlyLinkedArtists.length > 0) {
    if (newlyLinkedArtists.length > 0) {
      for (let p = 0; p < artists.length; p += 1) {
        for (let q = 0; q < newlyLinkedArtists.length; q += 1) {
          if (artists[p].artistId === newlyLinkedArtists[q].artistId) {
            artists[p].songs.push({
              title: prevSongData.title,
              songId: prevSongData.songId
            });
          }
        }
      }
    }
    const availArtists = linkedArtists.concat(newlyLinkedArtists);
    prevSongData.artists.push(
      ...availArtists.map((artist) => {
        if (artist.artistId === undefined)
          logger.warn(`Artist without an id found.`, { ARTIST_NAME: artist.name });
        return {
          artistId: artist.artistId as string,
          name: artist.name
        };
      })
    );
  }

  const updatedArtists = artists.filter((artist) => artist.songs.length > 0);
  return {
    updatedArtists,
    artistsWithIds,
    artistsWithoutIds,
    unlinkedArtists,
    linkedArtists,
    newlyLinkedArtists
  };
};
*/

/* DEPRECATED - Old function not used in new implementation
const manageGenreDataUpdates = (
  genres: SavableGenre[],
  prevSongData: SavableSongData,
  newSongData: SongTags,
  songArtworkPaths: ArtworkPaths
) => {
  const { songId } = prevSongData;
  // these genres should be created as new genres.
  const genresWithoutIds = Array.isArray(newSongData.genres)
    ? newSongData.genres.filter((genre) => typeof genre.genreId !== 'string')
    : [];
  // these genres are available in the library but may not be in the initial song data.
  const genresWithIds = Array.isArray(newSongData.genres)
    ? newSongData.genres.filter((genre) => typeof genre.genreId === 'string')
    : [];
  //  these genres are available in the library and recently unlinked from the song.
  const unlinkedGenres =
    genresWithIds.length > 0 && Array.isArray(prevSongData.genres)
      ? prevSongData.genres.filter((a) => !genresWithIds?.some((b) => a.genreId === b.genreId))
      : [];
  // these Genres are available in the library and already linked to the song.
  const linkedGenres =
    genresWithIds.length > 0 && Array.isArray(prevSongData.genres)
      ? genresWithIds.filter((a) => prevSongData.genres?.some((b) => a.genreId === b.genreId))
      : [];
  //  these Genres are available in the library and recently linked to the song.
  const newlyLinkedGenres =
    genresWithIds.length > 0 && Array.isArray(prevSongData.genres)
      ? genresWithIds.filter((a) => !prevSongData.genres?.some((b) => a.genreId === b.genreId))
      : [];

  prevSongData.genres = [];
  if (genresWithoutIds.length > 0) {
    for (let int = 0; int < genresWithoutIds.length; int += 1) {
      const genreData = genresWithoutIds[int];
      const newGenre: SavableGenre = {
        genreId: generateRandomId(),
        name: genreData.name,
        songs: [{ title: prevSongData.title, songId }],
        artworkName: path.basename(songArtworkPaths.artworkPath),
        paletteId: prevSongData.paletteId
      };
      prevSongData.genres.push({
        genreId: newGenre.genreId,
        name: newGenre.name
      });
      genres.push(newGenre);
    }
  }
  if (unlinkedGenres.length > 0) {
    for (let i = 0; i < genres.length; i += 1) {
      if (unlinkedGenres.some((unlinkedGenre) => unlinkedGenre.genreId === genres[i].genreId)) {
        if (genres[i].songs.length === 1 && genres[i].songs[0].songId === songId) {
          logger.debug(
            `'${genres[i].name}' got removed because user removed the only link it has with a song.`,
            { genreId: genres[i].genreId }
          );
          genres.splice(i, 1);
        } else {
          genres[i].songs = genres[i].songs.filter((s) => s.songId !== songId);
        }
      }
    }
  }
  if (linkedGenres.length > 0 || newlyLinkedGenres.length > 0) {
    if (newlyLinkedGenres.length > 0) {
      for (let p = 0; p < genres.length; p += 1) {
        for (let q = 0; q < newlyLinkedGenres.length; q += 1) {
          if (genres[p].genreId === newlyLinkedGenres[q].genreId) {
            genres[p].songs.push({ title: prevSongData.title, songId });
          }
        }
      }
    }
    const availGenres = linkedGenres.concat(newlyLinkedGenres);
    prevSongData.genres.push(
      ...availGenres.map((genre) => {
        if (genre.genreId === undefined)
          logger.warn(`Genre without an id found.`, { genreName: genre.name });
        return { genreId: genre.genreId as string, name: genre.name };
      })
    );
  }

  const updatedGenres = genres.filter((genre) => genre.songs.length > 0);
  return {
    updatedGenres,
    updatedSongData: prevSongData,
    genresWithIds,
    genresWithoutIds,
    newlyLinkedGenres,
    linkedGenres,
    unlinkedGenres
  };
};
*/

/* DEPRECATED - Old function not used in new implementation
const manageAlbumDataUpdates = (
  albums: SavableAlbum[],
  prevSongData: SavableSongData,
  newSongData: SongTags,
  songArtworkPaths: ArtworkPaths
) => {
  const { songId } = prevSongData;
  if (newSongData.album) {
    // album is newly created or available in the library.
    if (newSongData.album.albumId) {
      // album in the song is available in the library.
      if (prevSongData.album?.albumId !== newSongData.album.albumId) {
        // song album changed to some other album in the library.
        for (let i = 0; i < albums.length; i += 1) {
          if (albums[i].albumId === prevSongData.album?.albumId) {
            albums[i].songs = albums[i].songs.filter((z) => z.songId !== songId);
          }
          if (albums[i].albumId === newSongData.album.albumId) {
            // ? These lines are removed because album artists will only be changed if the albumArtist is changed.
            // if (prevSongData.artists && albums[i].artists) {
            //   albums[i].artists = albums[i].artists?.filter(
            //     (d) =>
            //       !prevSongData.artists?.some((e) => e.artistId === d.artistId),
            //   );
            // }
            // if (newSongData.artists) {
            //   albums[i].artists?.push(
            //     ...newSongData.artists.map((x) => ({
            //       name: x.name,
            //       artistId: x.artistId as string,
            //     })),
            //   );
            // }
            albums[i].songs.push({ title: prevSongData.title, songId });
            prevSongData.album = {
              name: albums[i].title,
              albumId: albums[i].albumId
            };
          }
        }
      }
      // song album hasn't changed.
    } else {
      // user created a new album for the song.
      for (let c = 0; c < albums.length; c += 1) {
        if (albums[c].albumId === prevSongData.album?.albumId) {
          albums[c].songs = albums[c].songs.filter((z) => z.songId !== songId);
        }
      }
      const newAlbum: SavableAlbum = {
        albumId: generateRandomId(),
        title: newSongData.album.title,
        songs: [{ title: newSongData.title, songId }],
        artworkName: path.basename(songArtworkPaths.artworkPath),
        artists: prevSongData.albumArtists || prevSongData.artists
      };
      prevSongData.album = { albumId: newAlbum.albumId, name: newAlbum.title };
      albums.push(newAlbum);
    }
  }
  // this means the song has no album or user deleted the previous album.
  else if (prevSongData.album?.albumId) {
    // song previously had an album but the user removed it.
    for (let c = 0; c < albums.length; c += 1) {
      if (albums[c].albumId === prevSongData.album?.albumId) {
        if (albums[c].songs.length === 1 && albums[c].songs[0].songId === songId) {
          albums.splice(c, 1);
        } else {
          albums[c].songs = albums[c].songs.filter((d) => d.songId !== prevSongData.songId);
        }
        prevSongData.album = undefined;
      }
    }
  }
  // song didn't have any album before
  const updatedAlbums = albums.filter((album) => album.songs.length > 0);
  return { updatedAlbums, updatedSongData: prevSongData };
};
*/

/* DEPRECATED - Old function not used in new implementation
const manageArtworkUpdates = async (prevSongData: SavableSongData, newSongData: SongTags) => {
  const { songId } = prevSongData;
  const newArtworkPath = newSongData.artworkPath
    ? removeDefaultAppProtocolFromFilePath(newSongData.artworkPath)
    : undefined;
  let isArtworkChanged = false;

  const artworkBuffer = await generateArtworkBuffer(newArtworkPath);

  const songPrevArtworkPaths = getSongArtworkPath(
    prevSongData.songId,
    prevSongData.isArtworkAvailable,
    false,
    true
  );

  if (songPrevArtworkPaths.artworkPath !== newArtworkPath) {
    logger.debug(`User changed the artwork of the song`, { songId });
    isArtworkChanged = true;
    // check whether song had an artwork before
    if (prevSongData.isArtworkAvailable) {
      // had an artwork before
      prevSongData.isArtworkAvailable = false;

      await removeArtwork(songPrevArtworkPaths).catch((err) => {
        logger.error(`Failed to remove the artwork of a song`, { err, songId });
        throw err;
      });
    }
    if (artworkBuffer) {
      const palettes = getPaletteData();
      const updatedPalettes =
        prevSongData.paletteId === 'DEFAULT_PALETTE'
          ? palettes
          : palettes.filter((palette) => palette.paletteId !== prevSongData.paletteId);
      const palette = await generatePalette(artworkBuffer);

      const processedArtwork = await processArtworkFiles('songs', artworkBuffer);
      if (processedArtwork.existing || processedArtwork.payloads) {
        prevSongData.isArtworkAvailable = !!artworkBuffer;
      }

      prevSongData.paletteId = palette?.paletteId;

      if (palette) updatedPalettes.push(palette);
      setPaletteData(updatedPalettes);
    }
  }
  return {
    songPrevArtworkPaths,
    artworkBuffer,
    updatedSongData: prevSongData,
    isArtworkChanged
  };
};
*/

const manageArtworkUpdatesOfSongsFromUnknownSource = async (
  prevSongTags: SongTags,
  newSongTags: SongTags
) => {
  const oldArtworkPath = prevSongTags.artworkPath
    ? removeDefaultAppProtocolFromFilePath(prevSongTags.artworkPath)
    : undefined;
  const newArtworkPath = newSongTags.artworkPath
    ? removeDefaultAppProtocolFromFilePath(newSongTags.artworkPath)
    : undefined;

  if (oldArtworkPath && newArtworkPath) {
    if (oldArtworkPath === newArtworkPath) {
      // artwork didn't change
      return { artworkPath: newArtworkPath };
    }
    // song previously had an artwork and user changed it with a new artwork
    const artworkBuffer = await generateArtworkBuffer(newArtworkPath);
    const artworkPath = artworkBuffer ? await createTempArtwork(artworkBuffer) : undefined;

    return { artworkPath, artworkBuffer };
  }
  if (typeof oldArtworkPath === 'string' && newArtworkPath === undefined) {
    // user removed the song artwork
    return { artworkPath: undefined };
  }
  if (typeof newArtworkPath === 'string' && oldArtworkPath === undefined) {
    // song didn't have an artwork but user added a new song artwork
    const artworkBuffer = await generateArtworkBuffer(newArtworkPath);
    const artworkPath = artworkBuffer ? await createTempArtwork(artworkBuffer) : undefined;

    return { artworkPath, artworkBuffer };
  }

  return { artworkPath: undefined };
};

const manageLyricsUpdates = (tags: SongTags, prevSongData?: SavableSongData) => {
  const parsedSyncedLyrics = tags.synchronizedLyrics
    ? parseLyrics(tags.synchronizedLyrics)
    : undefined;
  const parsedUnsyncedLyrics = tags.unsynchronizedLyrics
    ? parseLyrics(tags.unsynchronizedLyrics)
    : undefined;

  // For node-taglib-sharp, we only store unsynchronized lyrics in the tag
  // Synchronized lyrics will be saved to LRC file separately
  const lyricsText = parsedSyncedLyrics
    ? parsedSyncedLyrics.unparsedLyrics
    : parsedUnsyncedLyrics?.unparsedLyrics;

  if (parsedSyncedLyrics || parsedUnsyncedLyrics) {
    updateCachedLyrics((cachedLyrics) => {
      if (cachedLyrics) {
        const { title } = cachedLyrics;
        if (title === tags.title || title === prevSongData?.title) {
          const lyrics = (parsedSyncedLyrics || parsedUnsyncedLyrics) as LyricsData;
          const { isSynced } = lyrics;
          const lyricsType: LyricsTypes = isSynced ? 'SYNCED' : 'ANY';

          cachedLyrics.lyrics = lyrics;
          cachedLyrics.lyricsType = lyricsType;
          cachedLyrics.lyrics.copyright = lyrics.copyright;
          cachedLyrics.source = 'IN_SONG_LYRICS';
          cachedLyrics.isOfflineLyricsAvailable = true;

          return cachedLyrics;
        }
      }
      return undefined;
    });
  }

  return {
    lyricsText,
    parsedSyncedLyrics,
    parsedUnsyncedLyrics
  };
};

const updateSongId3TagsOfUnknownSource = async (
  songPath: string,
  newSongTags: SongTags,
  sendUpdatedData: boolean
) => {
  const pathExt = path.extname(songPath).replace(/\W/, '');
  const isASupporedFormat = metadataEditingSupportedExtensions.includes(pathExt);

  if (!isASupporedFormat) {
    logger.warn(
      `Lyrics cannot be saved because current song extension (${pathExt}) is not supported for modifying metadata.`,
      { songPath }
    );
    return sendMessageToRenderer({
      messageCode: 'SONG_EXT_NOT_SUPPORTED_FOR_LYRICS_SAVES',
      data: { ext: pathExt }
    });
  }

  const songsOutsideLibraryData = getSongsOutsideLibraryData();

  for (const songOutsideLibraryData of songsOutsideLibraryData) {
    if (songOutsideLibraryData.path === songPath) {
      const songPathWithoutDefaultUrl = removeDefaultAppProtocolFromFilePath(songPath);

      const oldSongTags = await sendSongMetadata(songPath, false);

      // ?  /////////// ARTWORK DATA FOR SONGS FROM UNKNOWN SOURCES /////////////////

      const { artworkPath, artworkBuffer } = await manageArtworkUpdatesOfSongsFromUnknownSource(
        oldSongTags,
        newSongTags
      );
      songOutsideLibraryData.artworkPath = artworkPath;

      updateSongsOutsideLibraryData(songOutsideLibraryData.songId, songOutsideLibraryData);

      // ?  /////////// LYRICS DATA FOR SONGS FROM UNKNOWN SOURCES /////////////////
      const { lyricsText, parsedSyncedLyrics } = manageLyricsUpdates(newSongTags);

      // Create artwork Picture object if available
      let artworkPicture: Picture | undefined;
      if (artworkPath) {
        const artworkPathWithoutProtocol = removeDefaultAppProtocolFromFilePath(artworkPath);
        const artBuf =
          artworkBuffer || (await generateLocalArtworkBuffer(artworkPathWithoutProtocol));
        if (artBuf) {
          const pngBuffer = await sharp(artBuf).toFormat('png').toBuffer();
          artworkPicture = Picture.fromData(ByteVector.fromByteArray(new Uint8Array(pngBuffer)));
          artworkPicture.mimeType = 'image/png';
          artworkPicture.type = PictureType.FrontCover;
          artworkPicture.description = 'artwork';
        }
      }

      const tags: TagData = {
        title: newSongTags.title,
        artists: newSongTags.artists?.map((artist) => artist.name),
        album: newSongTags.albums?.[0]?.title,
        genres: newSongTags.genres?.map((genre) => genre.name),
        composer: newSongTags.composer,
        trackNumber: newSongTags.trackNumber,
        year: newSongTags.releasedYear,
        artwork: artworkPicture,
        lyrics: lyricsText
      };

      // Persist immediately unless this exact song is currently playing, in
      // which case the write stays deferred until playback moves away from it.
      const queueResult = addMetadataToPendingQueue({
        songPath: songPathWithoutDefaultUrl,
        tags,
        isKnownSource: false,
        sendUpdatedData
      });

      // The queue returns a promise when it flushes now and a plain marker when
      // deferred. Awaiting here prevents floating-promise failures and ensures
      // the write completed before this function reports success.
      if (queueResult instanceof Promise) {
        await queueResult;
      }

      // Save synced lyrics to LRC file
      if (parsedSyncedLyrics) {
        saveLyricsToLRCFile(songPath, {
          title: newSongTags.title,
          source: 'IN_SONG_LYRICS',
          isOfflineLyricsAvailable: true,
          lyricsType: 'SYNCED',
          lyrics: parsedSyncedLyrics
        });
      }

      if (sendUpdatedData) {
        const updatedData: AudioPlayerData = {
          songId: songOutsideLibraryData.songId,
          title: newSongTags.title,
          artists: newSongTags.artists?.map((artist) => ({
            ...artist,
            artistId: artist.artistId || 0
          })),
          album: newSongTags.albums?.[0]
            ? {
                albumId: newSongTags.albums[0].albumId || 0,
                name: newSongTags.albums[0].title
              }
            : undefined,
          artwork: artworkBuffer ? Buffer.from(artworkBuffer).toString('base64') : undefined,
          artworkPath: artworkPath ? path.join(DEFAULT_FILE_URL, artworkPath) : undefined,
          duration: newSongTags.duration,
          isAFavorite: false,
          path: songOutsideLibraryData.path,
          isKnownSource: false,
          isBlacklisted: await isSongBlacklisted(
            songOutsideLibraryData.songId,
            songOutsideLibraryData.path
          )
        };

        return updatedData;
      }
    }
  }
  return undefined;
};

const updateSongId3Tags = async (
  songIdOrPath: number | string,
  tags: SongTags,
  sendUpdatedData = false,
  isKnownSource = true
) => {
  const result: UpdateSongDataResult = { success: false };

  if (!isKnownSource) {
    try {
      const data = await updateSongId3TagsOfUnknownSource(
        songIdOrPath as string,
        tags,
        sendUpdatedData
      );
      if (data) result.updatedData = data;
      result.success = true;

      return result;
    } catch (error) {
      logger.error('Failed to update id3 tags of a song from unknown source.', {
        error,
        songIdOrPath,
        sendUpdatedData
      });
      return result;
    }
  }

  try {
    logger.debug(`Started the song data updating process for song '${songIdOrPath}'`);

    const isNumericId =
      typeof songIdOrPath === 'number' ||
      (!isNaN(Number(songIdOrPath)) &&
        !String(songIdOrPath).includes('/') &&
        !String(songIdOrPath).includes('\\'));

    console.log('[updateSongId3Tags] Lookup Arguments:', {
      originalSongIdOrPath: songIdOrPath,
      typeofOriginal: typeof songIdOrPath,
      isNumericId,
      lookupId: isNumericId ? Number(songIdOrPath) : songIdOrPath,
      lookupMethod: isNumericId ? 'getSongById' : 'getSongByPath'
    });

    let song = isNumericId
      ? await getSongById(Number(songIdOrPath))
      : await getSongByPath(String(songIdOrPath));

    if (!song && isNumericId) {
      console.log(
        '[updateSongId3Tags] getSongById yielded no result, attempting getSongByPath fallback for:',
        songIdOrPath
      );
      song = await getSongByPath(String(songIdOrPath));
    }

    console.log('[updateSongId3Tags] Lookup Result:', {
      found: !!song,
      songId: song?.id,
      songTitle: song?.title,
      songPath: song?.path
    });

    if (!song) {
      console.error('[updateSongId3Tags] Exact location: Song not found in database', {
        songIdOrPath,
        typeofSongIdOrPath: typeof songIdOrPath
      });
      logger.error('Song not found in database', { songIdOrPath });
      throw new Error('Song not found in database');
    }

    const songId = song.id;
    let artworkBuffer: Buffer | undefined;
    let artwork: Picture | undefined;

    const newArtworkPath = tags.artworkPath
      ? removeDefaultAppProtocolFromFilePath(tags.artworkPath)
      : undefined;

    let processedArtwork: { existing?: any; payloads?: any } | undefined;
    if (newArtworkPath || tags.artworkBuffer) {
      const buffer =
        (tags.artworkBuffer as Buffer | undefined) ||
        (newArtworkPath ? await generateArtworkBuffer(newArtworkPath) : undefined);
      artworkBuffer = buffer || undefined;

      if (artworkBuffer) {
        // Store artwork and generate palette (outside transaction)
        await generatePalette(artworkBuffer);
        processedArtwork = await processArtworkFiles('songs', artworkBuffer);
        artwork = await parseImgDataForNodeID3(getSongArtworkPath(songId, true), artworkBuffer);
      }
    }

    // Execute all updates in a database transaction
    await db.transaction(async (trx) => {
      // / / / / / SONG BASIC FIELDS / / / / / / /
      await updateSongBasicFields(
        songId,
        {
          title: tags.title,
          year: tags.releasedYear,
          trackNumber: tags.trackNumber,
          discNumber: tags.discNumber,
          musicBrainzRecordingId: tags.musicBrainzRecordingId,
          isrc: tags.isrc
        },
        trx
      );

      // / / / / / RELATIONAL SYNC (artworks, artists, album, genres) / / / / / / /
      // P1 extraction: verbatim behavior now lives in syncSongRelationalData
      await syncSongRelationalData({
        songId,
        song,
        tags,
        processedArtwork,
        trx
      });
    });

    libraryScheduler.requestMaintenance();

    // Transaction succeeded, now update the file system
    logger.debug('Database transaction completed successfully');

    // / / / / / SONG LYRICS / / / / / / /
    const { lyricsText, parsedSyncedLyrics } = manageLyricsUpdates(tags);

    // / / / / / SONG FILE UPDATE PROCESS / / / / / /
    const tagData: TagData = {
      title: tags.title,
      artists: tags.artists?.map((artist) => artist.name),
      album: tags.albums?.[0]?.title,
      genres: tags.genres ? parseGenreList(tags.genres.map((genre) => genre.name)) : undefined,
      composer: tags.composer,
      trackNumber: tags.trackNumber,
      discNumber: tags.discNumber,
      year: tags.releasedYear,
      artwork,
      lyrics: lyricsText,
      musicBrainzRecordingId: tags.musicBrainzRecordingId,
      isrc: tags.isrc
    };

    // Add to pending queue for file write
    const queueResult = await addMetadataToPendingQueue({
      songPath: song.path,
      tags: tagData,
      isKnownSource: true,
      sendUpdatedData
    });

    // Save synced lyrics to LRC file
    if (parsedSyncedLyrics) {
      saveLyricsToLRCFile(song.path, {
        title: tags.title,
        source: 'IN_SONG_LYRICS',
        isOfflineLyricsAvailable: true,
        lyricsType: 'SYNCED',
        lyrics: parsedSyncedLyrics
      });
    }

    if ((queueResult as any)?.modifiedDate) {
      await updateSongModifiedAtByPath(song.path, new Date((queueResult as any).modifiedDate));
    }

    // Emit data update events
    dataUpdateEvent('songs/artworks', [songId]);
    dataUpdateEvent('songs/updatedSong', [songId]);
    dataUpdateEvent('artists');
    dataUpdateEvent('albums');
    dataUpdateEvent('genres');

    result.success = true;
    if (queueResult && 'deferred' in queueResult && queueResult.deferred) {
      result.deferred = true;
    }

    if (sendUpdatedData) {
      // Fetch updated song data for response
      const updatedSong = await getSongByPath(song.path);

      if (updatedSong) {
        const songArtists =
          updatedSong.artists?.map((a) => ({
            artistId: a.artist.id,
            name: a.artist.name,
            artworkPath: getArtistArtworkPath(undefined).artworkPath,
            onlineArtworkPaths: undefined
          })) || [];

        const data: AudioPlayerData = {
          songId: songId,
          title: updatedSong.title,
          artists: songArtists,
          album: updatedSong.albums?.[0]
            ? {
                albumId: updatedSong.albums[0].album.id,
                name: updatedSong.albums[0].album.title
              }
            : undefined,
          artwork: artworkBuffer ? Buffer.from(artworkBuffer).toString('base64') : undefined,
          artworkPath: getSongArtworkPath(songId, !!artworkBuffer).artworkPath,
          duration: Number(updatedSong.duration ?? 0),
          isAFavorite: updatedSong.isFavorite,
          isBlacklisted: await isSongBlacklisted(songId, updatedSong.path),
          path: updatedSong.path,
          isKnownSource: true
        };
        result.updatedData = data;
      }
    }

    logger.debug(`Song data updated successfully`, { songId });
    return result;
  } catch (err: any) {
    if ('message' in err) {
      result.reason = err.message;
      sendMessageToRenderer({
        messageCode: 'METADATA_UPDATE_FAILED',
        data: { message: err.message }
      });
    }
    logger.error('Song metadata update failed.', { err });
    return result;
  }
};

export default updateSongId3Tags;
