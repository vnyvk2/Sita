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
 *   1. ONE DB transaction: scalars (incl. isrc/mbid) + relational sync +
 *      durable undo journal + (when deferred) the COMPLETE pending-write
 *      intent incl. albumArtist/artwork. Journal and deferral commit or
 *      roll back atomically WITH the mutation (audit P0 #1/#2/#3).
 *   2. memory-stack adoption of the committed journal entry
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

  public execute(
    mutations: NormalizedMutation[],
    opts?: { albumTitle?: string; groupUndo?: { description: string } }
  ): Promise<OrchestratorResult> {
    return runExclusiveMetadataApply(() => this.executeInternal(mutations, opts));
  }

  private async executeInternal(
    mutations: NormalizedMutation[],
    opts?: { albumTitle?: string; groupUndo?: { description: string } }
  ): Promise<OrchestratorResult> {
    const result: OrchestratorResult = {
      success: true,
      updatedCount: 0,
      failedCount: 0,
      deferredCount: 0,
      errors: []
    };

    const groupPrev: SongMetadataSnapshot[] = [];
    const groupUpdated: SongMetadataSnapshot[] = [];
    const groupId = `orch-group-${mutations[0]?.operationId ?? Date.now()}`;
    for (const mutation of mutations) {
      try {
        const outcome = await this.executeSingle(mutation, {
          groupUndo: opts?.groupUndo,
          groupId,
          albumTitle: opts?.albumTitle,
          onSnapshots: (prev, upd) => {
            groupPrev.push(prev);
            groupUpdated.push(upd);
          }
        });
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

    // Grouped undo: ONE journal entry covering the operation. The durable row
    // was appended per-mutation INSIDE each DB transaction (so a partial
    // failure keeps coverage for every song that actually committed -
    // audit P0 #2); here we only mirror the committed result into memory.
    if (opts?.groupUndo && groupPrev.length > 0) {
      this.historyService.adoptSnapshot({
        id: groupId,
        timestamp: Date.now(),
        description: opts.groupUndo.description,
        ...(opts.albumTitle !== undefined && { albumTitle: opts.albumTitle }),
        songIds: groupPrev.map((s) => s.songId),
        previousSongs: groupPrev,
        updatedSongs: groupUpdated
      });
    }

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
    // Complete physical-file intent (audit P0 #4): the deferred write must be
    // able to reproduce EXACTLY what an immediate write would have done -
    // including release-level album artist and artwork.
    if (payload.albumArtist !== undefined) td.albumArtist = payload.albumArtist ?? '';
    if (payload.artworkBuffer && payload.artworkBuffer.length > 0) {
      // taglib Picture instances are not jsonb-serializable; travel as base64
      // and get embedded by savePendingMetadataUpdates at flush time.
      td.artworkBase64 = payload.artworkBuffer.toString('base64');
    }
    if (payload.musicBrainzRecordingId !== undefined)
      td.musicBrainzRecordingId = payload.musicBrainzRecordingId ?? '';
    if (payload.isrc != null) td.isrc = payload.isrc;
    return td;
  }

  private stripProtocol(p: string): string {
    return p.replace(/^file:\/\/\/?/, '');
  }

  private async executeSingle(
    m: NormalizedMutation,
    group?: {
      groupUndo?: { description: string };
      groupId?: string;
      albumTitle?: string;
      onSnapshots?: (prev: SongMetadataSnapshot, updated: SongMetadataSnapshot) => void;
    }
  ): Promise<{ success: boolean; deferred?: boolean; error?: string }> {
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

    // Deferral decision happens BEFORE the transaction: the durable pending
    // write must be committed atomically WITH the DB mutation (audit P0 #1),
    // never as an unawaited fire-and-forget afterwards.
    const playingPath = this.getCurrentPlayingPath();
    const normalizedPlaying = playingPath ? this.stripProtocol(playingPath) : undefined;
    const normalizedTarget = this.stripProtocol(m.filePath);
    const deferToPlaying =
      m.fileWrite.deferredIfPlaying && normalizedPlaying !== undefined && normalizedPlaying === normalizedTarget;

    const payload = this.buildTagPayload(m, artworkBuffer);

    // Post-state snapshot for the undo journal (built ahead of the transaction
    // so the journal row can be staged INSIDE it - audit P0 #2/#3).
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

    let deferredTagData: TagData | undefined;

    // ── ONE DB transaction: scalars + relational projection + undo journal +
    //    (deferred) durable pending-write intent (audit P0 #1/#2/#3) ────────
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

        // Release-level junction truth (2a semantics). `fresh` above was
        // captured BEFORE syncSongRelationalData - when the album itself
        // changed, that snapshot still points at the old (possibly deleted)
        // album, so re-read the post-sync state and resolve-or-create only
        // when the song still has no album (audit P1 #4).
        if (m.albumArtistNewValue !== undefined) {
          const postSync = await getSongById(m.songId, trx);
          let albumId = postSync?.albums?.[0]?.album?.id;
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

        // Durable undo journal - SAME transaction as the mutation: a crash can
        // never leave DB=new with undo=missing (audit P0 #3), and a partial
        // group failure still journals every song that committed (P0 #2).
        if (group?.groupUndo && group.groupId) {
          await this.historyService.appendToGroupSnapshotInTransaction(
            {
              id: group.groupId,
              description: group.groupUndo.description,
              ...(group.albumTitle !== undefined && { albumTitle: group.albumTitle }),
              previousSong: previous,
              updatedSong: updatedSnapshot
            },
            trx
          );
        } else {
          await this.historyService.persistSnapshotInTransaction(
            {
              id: `orch-${m.mutationId}`,
              timestamp: Date.now(),
              description: m.undo.description,
              ...(m.undo.albumTitle !== undefined && { albumTitle: m.undo.albumTitle }),
              songIds: [m.songId],
              previousSongs: [previous],
              updatedSongs: [updatedSnapshot]
            },
            trx
          );
        }

        // Complete physical-file intent for the deferred write, committed in
        // the SAME transaction (audit P0 #4): includes albumArtist + artwork,
        // unlike the legacy TagData subset. A rejected insert rolls back the
        // whole mutation instead of reporting success while unpersisted.
        if (deferToPlaying) {
          const mod = await import('@main/updateSong/updateSongId3Tags');
          deferredTagData = this.payloadToPendingTagData(payload);
          await mod.persistDeferredMetadataWrite(normalizedTarget, deferredTagData, trx);
        }
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `DB phase failed: ${msg}` };
    }

    // Transaction committed: mirror the journal entry into the memory stack
    // and collect group snapshots. Only reached on success - a failed
    // transaction returned above, so no phantom memory entries can exist.
    if (group?.groupUndo) {
      group.onSnapshots?.(previous, updatedSnapshot);
    } else {
      this.historyService.adoptSnapshot({
        id: `orch-${m.mutationId}`,
        timestamp: Date.now(),
        description: m.undo.description,
        ...(m.undo.albumTitle !== undefined && { albumTitle: m.undo.albumTitle }),
        songIds: [m.songId],
        previousSongs: [previous],
        updatedSongs: [updatedSnapshot]
      });
    }

    // ── File phase (atomic; deferred when playing) ─────────────────────────
    if (deferToPlaying && deferredTagData) {
      // Hydrate the coalescing queue WITHOUT touching the durable row - it
      // was committed atomically above and must survive until the flush
      // actually succeeds (savePendingMetadataUpdates deletes it on success).
      const mod = await import('@main/updateSong/updateSongId3Tags');
      mod.enqueueDeferredMetadataInMemory(normalizedTarget, deferredTagData);
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
