import type { DBTransaction } from '@main/db/db';
import { db } from '@main/db/db';
import { getSongById, updateSongBasicFields } from '@main/db/queries/songs';
import { getAlbumWithTitle, linkSongToAlbum } from '@main/db/queries/albums';
import { processArtworkFiles } from '@main/other/artworks';
import generatePalette from '@main/other/generatePalette';
import manageAlbumArtistOfParsedSong from '@main/parseSong/manageAlbumArtistOfParsedSong';
import { syncSongRelationalData } from '@main/parseSong/syncSongRelationalData';
import logger from '@main/logger';

import type { ArtworkDownloaderService } from '../transactions/ArtworkDownloaderService';
import type { TagWritePayload, TagWriterService } from '../services/TagWriterService';
import type { SongMetadataSnapshot } from '../history/MetadataHistoryService';
import { MetadataHistoryService } from '../history/MetadataHistoryService';
import type { NormalizedMutation, OrchestratorResult } from './contract';
import { runExclusiveMetadataApply } from '../../utils/metadataApplyMutex';
import type { TagData } from '@main/updateSong/updateSongId3Tags';

export interface MetadataApplyOrchestratorOptions {
  tagWriter: TagWriterService;
  historyService: MetadataHistoryService;
  artworkDownloader?: ArtworkDownloaderService;
  /** Injected to avoid an import cycle with main.ts */
  getCurrentPlayingPath?: () => string | undefined;
}

/**
 * ─── MetadataApplyOrchestrator (2c) ────────────────────────────────────────
 * Single authoritative owner of a metadata state transition and its recovery
 * protocol across DB, filesystem, artwork and the undo journal.
 *
 * Phase order per mutation:
 *   0. pre-state capture + artwork acquisition (size-capped download,
 *      palette, artwork file processing)
 *   1. DB phase - one transaction: scalars (incl. isrc/mbid) + relational sync
 *   2. durable undo journal push - a crash between DB & file stays undoable
 *   3. file phase - atomic write; deferred when the song is playing
 *
 * Compensation: a hard (non-deferred) file-phase failure reverts DB scalars
 * from the captured snapshot. Relational compensation is logged-only until
 * P4 finishes fan-out removal (documented limitation).
 */
export class MetadataApplyOrchestrator {
  private readonly tagWriter: TagWriterService;
  private readonly historyService: MetadataHistoryService;
  private readonly artworkDownloader?: ArtworkDownloaderService;
  private readonly getCurrentPlayingPath: () => string | undefined;

  constructor(options: MetadataApplyOrchestratorOptions) {
    this.tagWriter = options.tagWriter;
    this.historyService = options.historyService;
    this.artworkDownloader = options.artworkDownloader;
    this.getCurrentPlayingPath = options.getCurrentPlayingPath ?? (() => undefined);
  }

  public execute(mutations: NormalizedMutation[], albumTitle?: string): Promise<OrchestratorResult> {
    return runExclusiveMetadataApply(() => this.executeInternal(mutations, albumTitle));
  }

  private async executeInternal(
    mutations: NormalizedMutation[],
    albumTitle?: string
  ): Promise<OrchestratorResult> {
    const result: OrchestratorResult = {
      success: true,
      updatedCount: 0,
      failedCount: 0,
      deferredCount: 0,
      errors: []
    };

    for (const mutation of mutations) {
      try {
        const outcome = await this.executeSingle(mutation);
        if (outcome.deferred) result.deferredCount += 1;
        else if (outcome.success) result.updatedCount += 1;
        else {
          result.failedCount += 1;
          result.errors.push(outcome.error ?? 'Unknown orchestrator failure');
        }
      } catch (err: unknown) {
        result.failedCount += 1;
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`[${mutation.mutationId}] ${msg}`);
      }
    }

    void albumTitle;
    result.success = result.failedCount === 0;
    return result;
  }

  private fieldNew(m: NormalizedMutation, id: string): string | number | undefined {
    return m.fields.find((f) => f.fieldId === id)?.newValue;
  }

  private buildTagPayload(m: NormalizedMutation, artworkBuffer?: Buffer): TagWritePayload {
    const payload: TagWritePayload = { filePath: m.filePath };
    for (const f of m.fields) {
      switch (f.fieldId) {
        case 'title': payload.title = String(f.newValue); break;
        case 'artist': payload.artist = String(f.newValue); break;
        case 'album': payload.album = String(f.newValue); break;
        case 'genre': payload.genre = String(f.newValue); break;
        case 'year': payload.year = Number(f.newValue); break;
        case 'trackNumber': payload.trackNumber = Number(f.newValue); break;
        case 'discNumber': payload.discNumber = Number(f.newValue); break;
        case 'isrc': payload.isrc = String(f.newValue); break;
        case 'musicBrainzRecordingId': payload.musicBrainzRecordingId = String(f.newValue); break;
        case 'style': break; // style has no physical frame mapping today
      }
    }
    if (m.albumArtistNewValue !== undefined) payload.albumArtist = m.albumArtistNewValue;
    if (artworkBuffer !== undefined) payload.artworkBuffer = artworkBuffer;
    return payload;
  }

  private payloadToPendingTagData(payload: TagWritePayload): TagData {
    const td: TagData = {};
    if (payload.title !== undefined && payload.title !== null) td.title = payload.title;
    if (payload.artist) td.artists = [payload.artist];
    if (payload.album) td.album = payload.album;
    if (payload.genre) td.genres = [payload.genre];
    if (payload.trackNumber != null) td.trackNumber = payload.trackNumber;
    if (payload.discNumber != null) td.discNumber = payload.discNumber;
    if (payload.year != null) td.year = payload.year;
    // NOTE(P2): artwork deferral for the playing song is not representable in
    // the pending TagData yet - it lands with the durable queue in P4.
    if (payload.musicBrainzRecordingId !== undefined)
      td.musicBrainzRecordingId = payload.musicBrainzRecordingId ?? '';
    if (payload.isrc != null) td.isrc = payload.isrc;
    return td;
  }

  private stripProtocol(p: string): string {
    return p.replace(/^file:\/\/\/?/, '');
  }

  private async executeSingle(m: NormalizedMutation): Promise<{ success: boolean; deferred?: boolean; error?: string }> {
    // ── Phase 0: pre-state + artwork ──────────────────────────────────────
    const currentRow = await getSongById(m.songId);
    if (!currentRow) return { success: false, error: `Song ${m.songId} not found` };

    const previous: SongMetadataSnapshot =
      m.undo.previousSongs?.[0] ?? {
        songId: m.songId,
        path: m.filePath,
        title: currentRow.title,
        artist: currentRow.artists?.[0]?.artist?.name,
        albumArtist: currentRow.albums?.[0]?.album?.artists?.[0]?.artist?.name,
        album: currentRow.albums?.[0]?.album?.title,
        year: currentRow.year ?? undefined,
        trackNumber: currentRow.trackNumber ?? undefined,
        discNumber: currentRow.diskNumber ?? undefined,
        genre: currentRow.genres?.[0]?.genre?.name,
        isrc: currentRow.isrc ?? undefined,
        musicBrainzRecordingId: currentRow.musicBrainzRecordingId ?? undefined
      };

    let artworkBuffer = m.artwork?.buffer;
    if (!artworkBuffer) {
      const legacyUrl = (m as unknown as { artworkUrl?: string }).artworkUrl;
      if (legacyUrl && this.artworkDownloader) {
        artworkBuffer = (await this.artworkDownloader.fetchAndValidateArtwork(legacyUrl)) ?? undefined;
      }
    }

    let processedArtwork: { existing?: any; payloads?: any } | undefined;
    if (artworkBuffer) {
      try {
        await generatePalette(artworkBuffer);
      } catch {
        // palette is decorative for tagging; never block apply on it
      }
      processedArtwork = await processArtworkFiles('songs', artworkBuffer);
    }

    // ── Phase 1: DB transaction (scalars + relational projection) ─────────
    try {
      await db.transaction(async (trx: DBTransaction) => {
        await updateSongBasicFields(
          m.songId,
          {
            title: this.fieldNew(m, 'title') as string | undefined,
            year: this.fieldNew(m, 'year') as number | undefined,
            trackNumber: this.fieldNew(m, 'trackNumber') as number | undefined,
            discNumber: this.fieldNew(m, 'discNumber') as number | undefined,
            isrc: this.fieldNew(m, 'isrc') as string | undefined,
            musicBrainzRecordingId: this.fieldNew(m, 'musicBrainzRecordingId') as string | undefined
          },
          trx
        );

        const fresh = await getSongById(m.songId, trx);
        if (!fresh) throw new Error(`Song ${m.songId} vanished mid-transaction`);

        await syncSongRelationalData({
          songId: m.songId,
          song: fresh,
          tags: {
            title: '',
            duration: 0,
            ...(this.fieldNew(m, 'artist') !== undefined && { artists: [{ name: String(this.fieldNew(m, 'artist')) }] }),
            ...(this.fieldNew(m, 'album') !== undefined && { albums: [{ title: String(this.fieldNew(m, 'album')) }] }),
            ...(this.fieldNew(m, 'genre') !== undefined && { genres: [{ name: String(this.fieldNew(m, 'genre')) }] })
          } as unknown as Parameters<typeof syncSongRelationalData>[0]['tags'],
          processedArtwork,
          trx
        });

        // Release-level junction truth (2a semantics). When the album itself
        // changed, resolve-or-create it so the junction lands on target.
        if (m.albumArtistNewValue !== undefined) {
          let albumId = fresh.albums?.[0]?.album?.id;
          if (albumId === undefined && this.fieldNew(m, 'album') !== undefined) {
            const albumTitleStr = String(this.fieldNew(m, 'album'));
            const existingAlbum = await getAlbumWithTitle(albumTitleStr, trx);
            if (existingAlbum) {
              albumId = existingAlbum.id;
              await linkSongToAlbum(existingAlbum.id, m.songId, trx);
            } else {
              const created = await import('@main/db/queries/albums').then((mod) =>
                mod.createAlbum({ title: albumTitleStr, year: Number(this.fieldNew(m, 'year') ?? NaN) }, trx)
              );
              albumId = created.id;
              await linkSongToAlbum(created.id, m.songId, trx);
            }
          }
          if (albumId !== undefined) {
            await manageAlbumArtistOfParsedSong({ albumArtists: [m.albumArtistNewValue], albumId }, trx);
          }
        }
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `DB phase failed: ${msg}` };
    }

    // ── Phase 2: durable undo journal ─────────────────────────────────────
    const updatedSnapshot: SongMetadataSnapshot = { songId: m.songId, path: m.filePath, title: currentRow.title };
    const setIf = <K extends keyof SongMetadataSnapshot>(key: K, value: SongMetadataSnapshot[K] | undefined): void => {
      if (value !== undefined) updatedSnapshot[key] = value;
    };
    setIf('title', this.fieldNew(m, 'title') as string | undefined);
    setIf('artist', this.fieldNew(m, 'artist') as string | undefined);
    setIf('albumArtist', m.albumArtistNewValue);
    setIf('album', this.fieldNew(m, 'album') as string | undefined);
    setIf('year', this.fieldNew(m, 'year') as number | undefined);
    setIf('trackNumber', this.fieldNew(m, 'trackNumber') as number | undefined);
    setIf('discNumber', this.fieldNew(m, 'discNumber') as number | undefined);
    setIf('genre', this.fieldNew(m, 'genre') as string | undefined);
    setIf('isrc', this.fieldNew(m, 'isrc') as string | undefined);
    setIf('musicBrainzRecordingId', this.fieldNew(m, 'musicBrainzRecordingId') as string | undefined);

    await this.historyService.pushSnapshot({
      id: `orch-${m.mutationId}`,
      timestamp: Date.now(),
      description: m.undo.description,
      ...(m.undo.albumTitle !== undefined && { albumTitle: m.undo.albumTitle }),
      songIds: [m.songId],
      previousSongs: [previous],
      updatedSongs: [updatedSnapshot]
    });

    // ── Phase 3: file phase (atomic; deferred when playing) ───────────────
    const payload = this.buildTagPayload(m, artworkBuffer);

    const playingPath = this.getCurrentPlayingPath();
    const normalizedPlaying = playingPath ? this.stripProtocol(playingPath) : undefined;
    const normalizedTarget = this.stripProtocol(m.filePath);

    if (m.fileWrite.deferredIfPlaying && normalizedPlaying === normalizedTarget) {
      const mod = await import('@main/updateSong/updateSongId3Tags');
      mod.queueMetadataWriteForPlayingSong(normalizedTarget, this.payloadToPendingTagData(payload));
      logger.info('[Orchestrator] deferred file write for currently-playing song', {
        songPath: normalizedTarget
      });
      return { success: true, deferred: true };
    }

    const writeRes = await this.tagWriter.writeTags(payload);
    if (!writeRes.success) {
      // Compensation (scalars only in P2 - see class doc): revert from snapshot
      try {
        await db.transaction(async (trx: DBTransaction) => {
          await updateSongBasicFields(
            m.songId,
            {
              title: previous.title,
              year: previous.year ?? null,
              trackNumber: previous.trackNumber ?? null,
              discNumber: previous.discNumber ?? null,
              isrc: previous.isrc ?? '',
              musicBrainzRecordingId: previous.musicBrainzRecordingId ?? ''
            },
            trx
          );
        });
      } catch (compErr: unknown) {
        logger.error('[Orchestrator] scalar compensation failed after file-write failure', { compErr });
      }
      await this.historyService.confirmUndo(`orch-${m.mutationId}`).catch(() => undefined);
      return { success: false, error: `File write failed for ${writeRes.filePath}: ${writeRes.error}` };
    }

    return { success: true };
  }
}
