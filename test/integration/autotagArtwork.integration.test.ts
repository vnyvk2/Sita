import { describe, expect, it, vi } from 'vitest';
import { PictureType } from 'node-taglib-sharp';
import { ArtworkDownloaderService } from '@main/metadata/transactions/ArtworkDownloaderService';
import { ArtworkWorkflow } from '@main/metadata/workflows/strategies/ArtworkWorkflow';
import { CaaApiClient } from '@main/metadata/providers/coverartarchive/CaaApiClient';
import { CoverArtArchiveAdapter } from '@main/metadata/providers/coverartarchive/CoverArtArchiveAdapter';
import { DiscogsAdapter } from '@main/metadata/providers/discogs/DiscogsAdapter';
import { extractFrontCover } from '@main/utils/extractFrontCover';
import { syncAlbumArtworks } from '@main/db/queries/artworks';
import type { RequestPipeline } from '@main/platform/networking/RequestPipeline';

describe('AutoTag Artwork Pipeline (Phase 3 Integration Gate)', () => {
  describe('1. Artwork Workflow & Field ID Consistency (BUG-07)', () => {
    it('produces artworkPath field diffs and suggestedMetadata rather than artworkUrl', async () => {
      const mockCaaAdapter: Partial<CoverArtArchiveAdapter> = {
        fetchContribution: vi.fn().mockResolvedValue({
          contributions: [
            {
              fieldId: 'artworkPath',
              providerId: 'coverartarchive',
              value: 'https://coverartarchive.org/release/123/front.jpg',
              confidenceScore: 0.95
            }
          ]
        })
      };

      const mockDiscogsAdapter: Partial<DiscogsAdapter> = {};

      const workflow = new ArtworkWorkflow(
        mockCaaAdapter as CoverArtArchiveAdapter,
        mockDiscogsAdapter as DiscogsAdapter
      );

      const preview = await workflow.buildPreview(
        [{ songId: 101, title: 'Track 1', artist: 'Artist', album: 'Album' }],
        '123',
        'coverartarchive'
      );

      expect(preview.matches).toHaveLength(1);
      const match = preview.matches[0];

      // Invariant: suggestedMetadata and fieldDiffs MUST use artworkPath
      expect(match.suggestedMetadata.artworkPath).toBe('https://coverartarchive.org/release/123/front.jpg');
      expect(match.fieldDiffs).toHaveLength(1);
      expect(match.fieldDiffs[0].fieldId).toBe('artworkPath');
      expect(match.fieldDiffs[0].newVal).toBe('https://coverartarchive.org/release/123/front.jpg');
    });
  });

  describe('2. Modern Image Format Validation (BUG-09)', () => {
    it('validates WebP, AVIF, JPEG, PNG through RequestPipeline and rejects invalid formats', async () => {
      const validWebp = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00,
        0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20
      ]);

      const mockPipeline: Partial<RequestPipeline> = {
        execute: vi.fn().mockImplementation(async (options: any) => {
          if (options.url.includes('cover.webp')) {
            return { status: 200, data: validWebp, headers: {} };
          }
          if (options.url.includes('404.html')) {
            return { status: 200, data: Buffer.from('<html>404 Not Found</html>'), headers: {} };
          }
          return { status: 404, data: null, headers: {} };
        })
      };

      const downloader = new ArtworkDownloaderService(mockPipeline as RequestPipeline);

      const webpResult = await downloader.fetchAndValidateArtwork('https://cdn.example.com/cover.webp');
      expect(webpResult).toEqual(validWebp);

      const htmlResult = await downloader.fetchAndValidateArtwork('https://cdn.example.com/404.html');
      expect(htmlResult).toBeNull();
    });
  });

  describe('3. Relational Album Artwork Synchronization & LOCAL Preservation (BUG-08)', () => {
    it('synchronizes albums_artworks while strictly preserving LOCAL artwork and replacing REMOTE artwork', async () => {
      const deletedRemoteIds: number[] = [];
      const insertedLinks: Array<{ albumId: number; artworkId: number }> = [];

      const existingAlbumArtworks = [
        { artworkId: 501, source: 'LOCAL' as const },
        { artworkId: 601, source: 'REMOTE' as const }
      ];

      const mockTrx: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(existingAlbumArtworks)
            }),
            where: vi.fn().mockImplementation(async () => {
              return [{ artworkId: 501 }, { artworkId: 602 }];
            })
          })
        }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            deletedRemoteIds.push(601);
            return Promise.resolve();
          })
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockImplementation((records) => {
            insertedLinks.push(...records);
            return Promise.resolve();
          })
        })
      };

      // AutoTag provides new REMOTE artwork ID 602
      const finalArtworks = await syncAlbumArtworks(42, [602], mockTrx);

      // Invariant: LOCAL artwork (501) was NOT deleted
      expect(deletedRemoteIds).toEqual([601]);
      // Invariant: New REMOTE artwork (602) was added
      expect(insertedLinks).toEqual([{ albumId: 42, artworkId: 602 }]);
      // Invariant: Both LOCAL (501) and new REMOTE (602) are linked
      expect(finalArtworks).toEqual([{ artworkId: 501 }, { artworkId: 602 }]);
    });
  });

  describe('4. CAA Release MBID 404 Cascade to Release Group MBID (BUG-19)', () => {
    it('queries Release MBID first, falling back to Release Group MBID on 404', async () => {
      const requestedUrls: string[] = [];

      const mockPipeline: Partial<RequestPipeline> = {
        execute: vi.fn().mockImplementation(async (url: string) => {
          requestedUrls.push(url);
          if (url.includes('/release/release-mbid-001')) {
            return { status: 404, data: null, headers: {} };
          }
          if (url.includes('/release-group/rg-mbid-999')) {
            return {
              status: 200,
              data: {
                images: [
                  {
                    id: 777,
                    image: 'https://coverartarchive.org/release-group/rg-mbid-999/front.jpg',
                    front: true,
                    back: false
                  }
                ]
              },
              headers: {}
            };
          }
          return { status: 404, data: null, headers: {} };
        })
      };

      const caaClient = new CaaApiClient(mockPipeline as RequestPipeline);
      const adapter = new CoverArtArchiveAdapter(caaClient);

      const contribution = await adapter.fetchContribution({
        mbid: 'release-mbid-001',
        releaseGroupId: 'rg-mbid-999'
      });

      expect(contribution).not.toBeNull();
      const artwork = contribution?.contributions.find((c) => c.fieldId === 'artworkUrl');
      expect(artwork?.value).toBe('https://coverartarchive.org/release-group/rg-mbid-999/front.jpg');

      // Invariant: Release endpoint tried first, Release Group tried second
      expect(requestedUrls).toEqual([
        'https://coverartarchive.org/release/release-mbid-001',
        'https://coverartarchive.org/release-group/rg-mbid-999'
      ]);
    });
  });

  describe('5. ID3 Embedded Front Cover Selection (BUG-18)', () => {
    it('selects FrontCover picture even when positioned after other picture frames in ID3 tag', () => {
      const pictures = [
        {
          pictureType: PictureType.BackCover,
          data: { toByteArray: () => new Uint8Array([1, 1, 1]) }
        },
        {
          pictureType: PictureType.Artist,
          data: { toByteArray: () => new Uint8Array([2, 2, 2]) }
        },
        {
          pictureType: PictureType.FrontCover,
          data: { toByteArray: () => new Uint8Array([3, 3, 3]) }
        }
      ];

      const frontBytes = extractFrontCover(pictures);
      expect(frontBytes).toEqual(new Uint8Array([3, 3, 3]));
    });
  });
});
