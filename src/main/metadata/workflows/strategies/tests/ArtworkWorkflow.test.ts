import { describe, it, expect, vi } from 'vitest';
import { ArtworkWorkflow } from '../ArtworkWorkflow';
import type { CoverArtArchiveAdapter } from '../../../providers/coverartarchive/CoverArtArchiveAdapter';

describe('ArtworkWorkflow', () => {
  it('exposes canonical artworkUrl in supportedFields', () => {
    const mockCaa = {} as unknown as CoverArtArchiveAdapter;
    const workflow = new ArtworkWorkflow(mockCaa);

    expect(workflow.supportedFields).toEqual([
      { fieldId: 'artworkUrl', displayName: 'Cover Art', category: 'artwork', defaultEnabled: true }
    ]);
  });

  it('builds preview with artworkUrl diff and preserves existing artworkPath as oldVal', async () => {
    const mockCaa = {
      fetchContribution: vi.fn().mockResolvedValue({
        providerId: 'coverartarchive',
        contributions: [
          {
            fieldId: 'artworkUrl',
            value: 'https://coverartarchive.org/release/123/front.jpg'
          }
        ]
      })
    } as unknown as CoverArtArchiveAdapter;

    const workflow = new ArtworkWorkflow(mockCaa);
    const preview = await workflow.buildPreview(
      [
        {
          songId: 42,
          title: 'Test Song',
          artist: 'Test Artist',
          album: 'Test Album',
          path: '/path/to/song.mp3',
          artworkPath: '/existing/art.webp'
        }
      ],
      'mbid-123',
      'coverartarchive'
    );

    expect(preview.matches).toHaveLength(1);
    const match = preview.matches[0];
    expect(match.suggestedMetadata?.artworkUrl).toBe('https://coverartarchive.org/release/123/front.jpg');
    expect(match.fieldDiffs).toHaveLength(1);
    expect(match.fieldDiffs[0].fieldId).toBe('artworkUrl');
    expect(match.fieldDiffs[0].oldValue).toBe('/existing/art.webp');
    expect(match.fieldDiffs[0].suggestedValue).toBe('https://coverartarchive.org/release/123/front.jpg');
    expect(match.fieldDiffs[0].applyField).toBe(true);
  });

  it('buildMutations expands field aliases between artworkUrl and artworkPath', async () => {
    const mockCaa = {
      fetchContribution: vi.fn().mockResolvedValue({
        providerId: 'coverartarchive',
        contributions: [
          { fieldId: 'artworkUrl', value: 'https://coverartarchive.org/release/123/front.jpg' }
        ]
      })
    } as unknown as CoverArtArchiveAdapter;

    const workflow = new ArtworkWorkflow(mockCaa);
    const preview = await workflow.buildPreview(
      [
        {
          songId: 42,
          title: 'Test Song',
          artist: 'Test Artist',
          album: 'Test Album',
          path: '/path/to/song.mp3'
        }
      ],
      'mbid-123',
      'coverartarchive'
    );

    // When caller requests legacy 'artworkPath'
    const legacyMutations = workflow.buildMutations(preview, ['artworkPath']);
    expect(legacyMutations[0].fieldMutations).toHaveLength(1);
    expect(legacyMutations[0].fieldMutations[0].fieldId).toBe('artworkUrl');
    expect(legacyMutations[0].fieldMutations[0].newValue).toBe('https://coverartarchive.org/release/123/front.jpg');

    // When caller requests canonical 'artworkUrl'
    const canonicalMutations = workflow.buildMutations(preview, ['artworkUrl']);
    expect(canonicalMutations[0].fieldMutations).toHaveLength(1);
    expect(canonicalMutations[0].fieldMutations[0].fieldId).toBe('artworkUrl');
  });
});
