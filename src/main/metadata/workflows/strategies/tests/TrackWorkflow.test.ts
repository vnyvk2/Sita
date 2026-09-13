import { describe, it, expect, vi } from 'vitest';
import { TrackWorkflow } from '../TrackWorkflow';
import type { MusicBrainzAdapter } from '../../../providers/musicbrainz/MusicBrainzAdapter';
import type { CoverArtArchiveAdapter } from '../../../providers/coverartarchive/CoverArtArchiveAdapter';

describe('TrackWorkflow', () => {
  it('exposes artworkUrl in supportedFields', () => {
    const mockMb = {} as unknown as MusicBrainzAdapter;
    const workflow = new TrackWorkflow(mockMb);

    const artField = workflow.supportedFields.find((f) => f.fieldId === 'artworkUrl');
    expect(artField).toBeDefined();
    expect(artField?.displayName).toBe('Cover Art');
    expect(artField?.category).toBe('artwork');
  });

  it('builds preview with artworkUrl diff when CoverArtArchiveAdapter finds cover art', async () => {
    const mockMb = {
      resolveRecording: vi.fn().mockResolvedValue({
        id: 'rec-123',
        title: 'New Track Title',
        artist: 'New Artist',
        album: 'New Album',
        trackNumber: 3,
        releaseId: 'rel-456',
        releaseGroupId: 'rg-789'
      })
    } as unknown as MusicBrainzAdapter;

    const mockCaa = {
      fetchContribution: vi.fn().mockResolvedValue({
        providerId: 'coverartarchive',
        contributions: [
          {
            fieldId: 'artworkUrl',
            value: 'https://coverartarchive.org/release/rel-456/front.jpg'
          }
        ]
      })
    } as unknown as CoverArtArchiveAdapter;

    const workflow = new TrackWorkflow(mockMb, mockCaa);
    const preview = await workflow.buildPreview(
      [
        {
          songId: 10,
          title: 'Old Title',
          artist: 'Old Artist',
          path: '/music/song.mp3',
          artworkPath: '/existing/cover.webp'
        }
      ],
      'rec-123',
      'musicbrainz'
    );

    expect(mockCaa.fetchContribution).toHaveBeenCalledWith({
      mbid: 'rel-456',
      releaseGroupId: 'rg-789'
    });

    expect(preview.primaryCandidate?.coverArtUrl).toBe('https://coverartarchive.org/release/rel-456/front.jpg');
    expect(preview.matches).toHaveLength(1);

    const match = preview.matches[0];
    expect(match.suggestedMetadata?.artworkUrl).toBe('https://coverartarchive.org/release/rel-456/front.jpg');

    const artDiff = match.fieldDiffs.find((d) => d.fieldId === 'artworkUrl');
    expect(artDiff).toBeDefined();
    expect(artDiff?.oldValue).toBe('/existing/cover.webp');
    expect(artDiff?.suggestedValue).toBe('https://coverartarchive.org/release/rel-456/front.jpg');
    expect(artDiff?.applyField).toBe(true);

    const mutations = workflow.buildMutations(preview, ['artworkUrl', 'title', 'artist']);
    expect(mutations[0].fieldMutations.some((m) => m.fieldId === 'artworkUrl')).toBe(true);
  });
});
