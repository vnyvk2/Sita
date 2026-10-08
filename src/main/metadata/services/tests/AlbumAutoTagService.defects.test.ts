import { describe, expect, it, vi } from 'vitest';

import type { ProgressEventPayload } from '../../models/AlbumTagPreview';
import { AlbumAutoTagService } from '../AlbumAutoTagService';

const localSongs = [
  {
    songId: 901,
    title: 'Matched Song',
    artist: 'Some Artist',
    album: 'Some LP',
    path: '/tmp/matched.mp3',
    duration: 200,
    trackNumber: 1
  },
  {
    songId: 902,
    title: 'Bonus Commentary Track With A Very Distinctive Name',
    artist: 'Some Artist',
    album: 'Some LP',
    path: '/tmp/bonus.mp3',
    duration: 95,
    trackNumber: 9
  }
];

const resolvedRelease: any = {
  album: { title: 'Some LP', artist: 'Some Artist', releaseId: 'rel-1' },
  tracks: [
    { trackId: 't1', title: 'Matched Song', artist: 'Some Artist', trackNumber: 1 },
    { trackId: 't2', title: 'Second Song', artist: 'Some Artist', trackNumber: 2 }
  ],
  provider: 'musicbrainz',
  providerReleaseId: 'rel-1'
};

const matchedPair: any = {
  localSong: localSongs[0],
  remoteTrack: {
    recording: { title: 'Matched Song', artist: 'Some Artist', album: 'Some LP', trackNumber: 1 },
    provider: { provider: 'musicbrainz', providerRecordingId: 'rec-1' }
  },
  confidence: 0.95,
  confidenceLevel: 'Excellent',
  scoreBreakdown: { title: 50, artist: 20, album: 10, year: 0, duration: 20, mbid: 0, total: 100 },
  why: 'Title Match | Artist Match',
  matchedBy: ['title', 'artist'],
  reasons: ['exact_title_match', 'artist_match']
};

describe('DEF-TAG-03: unmatched local tracks are retained in the preview', () => {
  it('surfaces local songs without a remote match instead of dropping them', async () => {
    const metadataService = {
      resolveRelease: vi.fn().mockResolvedValue(resolvedRelease),
      buildAlbumMatch: vi.fn().mockResolvedValue({
        trackList: [matchedPair],
        album: resolvedRelease.album,
        confidence: 0.9,
        warnings: []
      })
    };
    const service = new AlbumAutoTagService({ albumMetadataService: metadataService as any });

    const preview = await service.buildPreview(localSongs as any, 'rel-1', 'musicbrainz');

    const localIds = preview.matches.map((m) => m.localSongId);
    // Matched song, unmatched local song, and the remote-only missing track.
    expect(localIds).toContain(901);
    expect(localIds).toContain(902);

    const unmatched = preview.matches.find((m) => m.localSongId === 902)!;
    expect(unmatched.applyTrack).toBe(false);
    expect(unmatched.fieldDiffs).toHaveLength(0);
    expect(unmatched.reasons).toContain('unmatched_local_track');
    expect(unmatched.hasWarnings).toBe(true);
    expect(preview.warnings.some((w) => w.includes('no confident match'))).toBe(true);
  });
});

describe('DEF-TAG-09: apply failures are reported under the resolved operation id', () => {
  it('emits failed progress for options.operationId, not the default id', async () => {
    const metadataService = { resolveRelease: vi.fn(), buildAlbumMatch: vi.fn() };
    const applyService = {
      applyPreview: vi.fn().mockRejectedValue(new Error('boom')),
      undoLastAutoTag: vi.fn()
    };
    const service = new AlbumAutoTagService({
      albumMetadataService: metadataService as any,
      applyService: applyService as any
    });

    const payloads: ProgressEventPayload[] = [];
    service.on('progress', (p) => payloads.push(p));

    const preview: any = { album: { title: 'Some LP' }, matches: [] };
    await expect(service.applyPreview(preview, { operationId: 'custom-op-9' })).rejects.toThrow(
      'boom'
    );

    const failed = payloads.filter((p) => p.stage === 'failed');
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((p) => p.operationId === 'custom-op-9')).toBe(true);
  });
});
