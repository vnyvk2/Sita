import { describe, expect, it, vi } from 'vitest';

import { MetadataHistoryService } from '../../history/MetadataHistoryService';
import { MetadataApplyService } from '../MetadataApplyService';
import type { TagWritePayload } from '../TagWriterService';

describe('DEF-TAG-01: deselected tracks keep track-level tags on album-level apply', () => {
  it('writes track-level fields only for selected tracks, globals for all', async () => {
    const execute = vi.fn().mockResolvedValue({
      success: true,
      updatedCount: 2,
      failedCount: 0,
      deferredCount: 0,
      errors: []
    });
    const applyService = new MetadataApplyService({
      orchestrator: { execute } as any
    });

    const preview: any = {
      album: { title: 'New Album' },
      matches: [
        {
          localSongId: 1,
          songPath: 'a.mp3',
          applyTrack: true,
          fieldDiffs: [
            { fieldId: 'title', applyField: true, suggestedValue: 'New Title' },
            { fieldId: 'trackNumber', applyField: true, suggestedValue: 1 }
          ]
        },
        {
          localSongId: 2,
          songPath: 'b.mp3',
          applyTrack: false,
          fieldDiffs: [
            { fieldId: 'title', applyField: true, suggestedValue: 'Hacked Title' },
            { fieldId: 'trackNumber', applyField: true, suggestedValue: 99 }
          ]
        }
      ]
    };

    const res = await applyService.applyPreview(preview, {
      replaceArtwork: false,
      globalMutations: { albumTitle: 'New Album', applyAlbumTitle: true }
    });

    expect(res.success).toBe(true);
    const mutations = execute.mock.calls[0][0];
    expect(mutations).toHaveLength(2);

    const selected = mutations.find((m: any) => m.songId === 1);
    expect(selected.fields.map((f: any) => f.fieldId)).toEqual(
      expect.arrayContaining(['title', 'trackNumber', 'album'])
    );

    // Deselected track: no track-level overwrites, album-level mutation still lands.
    const deselected = mutations.find((m: any) => m.songId === 2);
    const deselectedFields = deselected.fields.map((f: any) => f.fieldId);
    expect(deselectedFields).not.toContain('title');
    expect(deselectedFields).not.toContain('trackNumber');
    expect(deselectedFields).toContain('album');
  });

  it('still applies selected-only track fields when no album-level changes exist', async () => {
    const execute = vi.fn().mockResolvedValue({
      success: true,
      updatedCount: 1,
      failedCount: 0,
      deferredCount: 0,
      errors: []
    });
    const applyService = new MetadataApplyService({
      orchestrator: { execute } as any
    });

    const preview: any = {
      album: { title: 'Same Album' },
      matches: [
        {
          localSongId: 1,
          songPath: 'a.mp3',
          applyTrack: true,
          fieldDiffs: [{ fieldId: 'title', applyField: true, suggestedValue: 'Fixed' }]
        },
        { localSongId: 2, songPath: 'b.mp3', applyTrack: false, fieldDiffs: [] }
      ]
    };

    await applyService.applyPreview(preview, {});
    const mutations = execute.mock.calls[0][0];
    expect(mutations).toHaveLength(1);
    expect(mutations[0].songId).toBe(1);
  });
});

describe('DEF-TAG-05: undo restores artwork from the journal', () => {
  const seedHistory = async (previousSongs: any[]) => {
    const history = new MetadataHistoryService();
    await history.pushSnapshot({
      id: 'snap-art',
      timestamp: Date.now(),
      description: 'artwork apply',
      songIds: previousSongs.map((s) => s.songId),
      previousSongs,
      updatedSongs: previousSongs
    });
    return history;
  };

  it('re-embeds the previous picture on undo', async () => {
    const written: TagWritePayload[] = [];
    const tagWriter: any = {
      writeBatch: vi.fn(async (payloads: TagWritePayload[]) => {
        written.push(...payloads);
        return payloads.map((p) => ({ filePath: p.filePath, success: true }));
      })
    };
    const history = await seedHistory([
      {
        songId: 1,
        path: 'a.mp3',
        title: 'Old',
        artworkBase64: Buffer.from('prev-bytes').toString('base64')
      }
    ]);
    const applyService = new MetadataApplyService({
      tagWriter,
      historyService: history,
      dbUpdater: vi.fn().mockResolvedValue(undefined)
    });

    const res = await applyService.undoLastAutoTag();
    expect(res.success).toBe(true);
    expect(res.restoredCount).toBe(1);
    expect(written).toHaveLength(1);
    expect(written[0].artworkBuffer).toEqual(Buffer.from('prev-bytes'));
  });

  it('clears the added picture when the file previously had none', async () => {
    const written: TagWritePayload[] = [];
    const tagWriter: any = {
      writeBatch: vi.fn(async (payloads: TagWritePayload[]) => {
        written.push(...payloads);
        return payloads.map((p) => ({ filePath: p.filePath, success: true }));
      })
    };
    const history = await seedHistory([
      { songId: 1, path: 'a.mp3', title: 'Old', artworkBase64: null }
    ]);
    const applyService = new MetadataApplyService({
      tagWriter,
      historyService: history,
      dbUpdater: vi.fn().mockResolvedValue(undefined)
    });

    const res = await applyService.undoLastAutoTag();
    expect(res.success).toBe(true);
    expect(written[0].clearArtwork).toBe(true);
    expect(written[0].artworkBuffer).toBeUndefined();
  });

  it('keeps text-only undo for snapshots predating artwork capture', async () => {
    const written: TagWritePayload[] = [];
    const tagWriter: any = {
      writeBatch: vi.fn(async (payloads: TagWritePayload[]) => {
        written.push(...payloads);
        return payloads.map((p) => ({ filePath: p.filePath, success: true }));
      })
    };
    const history = await seedHistory([{ songId: 1, path: 'a.mp3', title: 'Old' }]);
    const applyService = new MetadataApplyService({
      tagWriter,
      historyService: history,
      dbUpdater: vi.fn().mockResolvedValue(undefined)
    });

    const res = await applyService.undoLastAutoTag();
    expect(res.success).toBe(true);
    expect(written[0].artworkBuffer).toBeUndefined();
    expect(written[0].clearArtwork).toBeUndefined();
  });
});
