// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { groupSongsByAlbum, updateMissingArtworkForSongs } from '../autoTagUtils';

vi.mock('../../services/metadataApi', () => ({
  metadataApi: {
    workflowSearch: vi.fn(),
    workflowBuildPreview: vi.fn(),
    workflowApplyPreview: vi.fn()
  }
}));

import { metadataApi } from '../../services/metadataApi';

const song = (overrides: Record<string, unknown>) => ({
  songId: 1,
  title: 'Track',
  artists: [{ name: 'Artist' }],
  album: { name: 'LP-A' },
  path: '/tmp/a.mp3',
  ...overrides
});

describe('groupSongsByAlbum', () => {
  it('groups songs sharing an album name', () => {
    const groups = groupSongsByAlbum([
      song({ songId: 1 }) as any,
      song({ songId: 2 }) as any,
      song({ songId: 3, album: { name: 'LP-B' } }) as any
    ]);
    expect(groups.size).toBe(2);
    expect(groups.get('LP-A')).toHaveLength(2);
    expect(groups.get('LP-B')).toHaveLength(1);
  });
});

describe('DEF-TAG-10: background artwork uses one cycle per album with unique op ids', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(metadataApi.workflowSearch).mockImplementation(async () => [
      { id: 'c1', provider: 'coverartarchive' } as any
    ]);
    vi.mocked(metadataApi.workflowBuildPreview).mockImplementation(async () => ({}) as any);
    vi.mocked(metadataApi.workflowApplyPreview).mockImplementation(
      async () =>
        ({
          success: true
        }) as any
    );
  });

  it('searches once per album group instead of once per song', async () => {
    const res = await updateMissingArtworkForSongs([
      song({ songId: 1 }) as any,
      song({ songId: 2, title: 'Track Two', path: '/tmp/b.mp3' }) as any,
      song({ songId: 3, album: { name: 'LP-B' }, path: '/tmp/c.mp3' }) as any
    ]);

    expect(metadataApi.workflowSearch).toHaveBeenCalledTimes(2);
    expect(metadataApi.workflowBuildPreview).toHaveBeenCalledTimes(2);
    expect(metadataApi.workflowApplyPreview).toHaveBeenCalledTimes(2);
    expect(res).toEqual({ updated: 3, skipped: 0, failed: 0 });

    // One preview carries the whole LP-A group.
    const previewInputs = vi.mocked(metadataApi.workflowBuildPreview).mock.calls.map((c) => c[1]);
    const sizes = previewInputs.map((i) => (i as unknown[]).length).sort();
    expect(sizes).toEqual([1, 2]);

    // Every IPC call gets its own operation id (no shared id to self-abort).
    const opIds = [
      ...vi.mocked(metadataApi.workflowSearch).mock.calls.map((c) => c[2]),
      ...vi.mocked(metadataApi.workflowBuildPreview).mock.calls.map((c) => c[4]),
      ...vi.mocked(metadataApi.workflowApplyPreview).mock.calls.map((c) => c[4])
    ];
    expect(new Set(opIds).size).toBe(opIds.length);
  });

  it('honors per-song counts on partially successful group applies', async () => {
    vi.mocked(metadataApi.workflowApplyPreview).mockImplementation(
      async () =>
        ({
          success: true,
          updatedCount: 1
        }) as any
    );

    const res = await updateMissingArtworkForSongs([
      song({ songId: 1 }) as any,
      song({ songId: 2, title: 'Track Two', path: '/tmp/b.mp3' }) as any,
      song({ songId: 3, album: { name: 'LP-B' }, path: '/tmp/c.mp3' }) as any
    ]);

    // LP-A reports 1 of 2 updated, LP-B 1 of 1.
    expect(res).toEqual({ updated: 2, skipped: 0, failed: 1 });
  });
});
