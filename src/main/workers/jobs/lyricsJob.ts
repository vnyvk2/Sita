import { EventEmitter } from 'events';
import { eq } from 'drizzle-orm';
import fs from 'fs/promises';
import { db } from '@main/db/db';
import { ASSET_EVENTS } from '../libraryChoreography';
import { lyrics } from '@main/db/schema';
import logger from '@main/logger';
import { getSongById } from '@main/db/queries/songs';
import fetchLyricsFromLrclib from '@main/utils/fetchLyricsFromLrclib';
import fetchLyricsFromMusixmatch from '@main/utils/fetchLyricsFromMusixmatch';
import type { Job, JobClass, JobState } from '../types';

export const CURRENT_LYRICS_GENERATOR_VERSION = 1;

export class LyricsJob implements Job {
  id: string;
  type = 'lyrics';
  state: JobState = 'queued';
  jobClass: JobClass;
  retries = 0;
  maxRetries = 2; // Short retries because permanent failures are cached
  description: string;

  public songId: number;
  private eventBus: EventEmitter;

  constructor(
    songId: number,
    songTitle: string,
    eventBus: EventEmitter,
    jobClass: JobClass = 'interactive'
  ) {
    this.songId = songId;
    this.eventBus = eventBus;
    this.id = `lyrics_${songId}`;
    this.jobClass = jobClass;
    this.description = `Fetching lyrics for "${songTitle}"`;
  }

  async execute(): Promise<void> {
    try {
      // 1. Idempotency and version check
      const existing = await db.query.lyrics.findFirst({
        where: (l, { eq }) => eq(l.songId, this.songId)
      });

      if (existing && CURRENT_LYRICS_GENERATOR_VERSION <= existing.generatorVersion) {
        logger.debug(`[LyricsJob] Song ${this.songId} already has lyrics (up to date).`);
        return;
      }

      const song = await getSongById(this.songId);
      if (!song) return;

      let foundLyricsText = '';
      let isSynced = false;
      let provider: 'FILESYSTEM' | 'EMBEDDED' | 'LRCLIB' | 'MUSIXMATCH' = 'LRCLIB';

      // ==========================================
      // PROVIDER CHAIN
      // ==========================================

      // 1. Filesystem LRC
      const lrcPath = song.path.substring(0, song.path.lastIndexOf('.')) + '.lrc';
      try {
        const lrcContent = await fs.readFile(lrcPath, 'utf8');
        if (lrcContent.trim().length > 0) {
          foundLyricsText = lrcContent;
          isSynced = lrcContent.includes('[00:');
          provider = 'FILESYSTEM';
        }
      } catch (e) {
        // Ignored
      }

      // 2. Embedded Tags
      if (!foundLyricsText) {
        const taglib = await import('node-taglib-sharp');
        let file;
        try {
          file = taglib.File.createFromPath(song.path);
          const lyricsFrames = file.tag?.lyrics;
          if (lyricsFrames) {
            foundLyricsText = lyricsFrames;
            isSynced = foundLyricsText.includes('[00:');
            provider = 'EMBEDDED';
          }
        } catch (e) {
          // Ignored
        } finally {
          file?.dispose();
        }
      }

      const artistName = song.artists?.[0]?.artist.name || 'Unknown Artist';
      const albumName = song.albums?.[0]?.album.title || 'Unknown Album';
      const durationSeconds = Math.floor(Number(song.duration));

      // 3. LRCLib
      if (!foundLyricsText) {
        try {
          const lrclibRes = await fetchLyricsFromLrclib({
            track_name: song.title,
            artist_name: artistName,
            album_name: albumName,
            duration: durationSeconds.toString()
          }, 'ANY');
          if (lrclibRes && lrclibRes.lyrics) {
            foundLyricsText = lrclibRes.lyrics;
            isSynced = lrclibRes.lyricsType === 'SYNCED';
            provider = 'LRCLIB';
          }
        } catch (e) {
           logger.debug(`[LyricsJob] LRCLib failed for ${song.title}`);
        }
      }

      // 4. Musixmatch
      if (!foundLyricsText) {
        try {
           const mxRes = await fetchLyricsFromMusixmatch({
            q_track: song.title,
            q_artist: artistName,
            q_artists: artistName,
            q_album: albumName,
            q_duration: durationSeconds.toString()
          }, 'ANY');
          if (mxRes && mxRes.lyrics) {
            foundLyricsText = mxRes.lyrics;
            isSynced = mxRes.lyricsType === 'SYNCED';
            provider = 'MUSIXMATCH';
          }
        } catch (e) {
           logger.debug(`[LyricsJob] Musixmatch failed for ${song.title}`);
        }
      }

      // If cancelled during fetch, skip DB save
      if (this.state === 'cancelled') return;

      // Even if empty, we save a record to prevent infinite fetching (permanent failure cache).
      // However, we must ensure we don't return an empty string to the user incorrectly.
      // But wait, the schema doesn't allow NULL for text. So an empty string is perfect.

      await db.transaction(async (trx) => {
        if (existing) {
          await trx.update(lyrics)
            .set({
              text: foundLyricsText,
              isSynced,
              provider,
              generatorVersion: CURRENT_LYRICS_GENERATOR_VERSION,
              updatedAt: new Date()
            })
            .where(eq(lyrics.songId, this.songId));
        } else {
          await trx.insert(lyrics).values({
            songId: this.songId,
            text: foundLyricsText,
            isSynced,
            provider,
            generatorVersion: CURRENT_LYRICS_GENERATOR_VERSION
          });
        }
      });

      this.eventBus.emit(ASSET_EVENTS.LYRICS_CREATED, {
        songId: this.songId,
        provider,
        isSynced
      });
    } catch (error) {
      logger.error(`[LyricsJob] Failed to fetch lyrics for song ${this.songId}`, { error });
      throw error;
    }
  }
}
