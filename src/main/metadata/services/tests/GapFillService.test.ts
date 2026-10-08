import { describe, expect, it, vi } from 'vitest';

import { GapFillService } from '../GapFillService';

vi.mock('../../../db/queries/songs', () => ({
  getSongsByIds: vi.fn().mockResolvedValue([])
}));

const song = (overrides: Record<string, unknown> = {}) => ({
  songId: 1,
  title: 'Track One',
  artist: 'Artist',
  album: 'LP',
  genre: '',
  path: '/tmp/a.mp3',
  ...overrides
});

const genreMutation = (songId: number, genre: string) => ({
  resourceId: songId,
  filePath: '/tmp/a.mp3',
  fieldMutations: [{ fieldId: 'genre', oldValue: '', newValue: genre }]
});

const artworkMutation = (songId: number, url: string) => ({
  resourceId: songId,
  filePath: '/tmp/a.mp3',
  fieldMutations: [{ fieldId: 'artworkUrl', oldValue: undefined, newValue: url }]
});

const harness = (opts?: {
  genreMutations?: unknown[];
  artworkMutations?: unknown[];
  genreAvailable?: boolean;
}) => {
  const genreWorkflow: any = {
    search: vi.fn().mockResolvedValue([{ id: 'd1', provider: 'discogs' }]),
    buildPreview: vi.fn().mockResolvedValue({ matches: [] }),
    buildMutations: vi.fn().mockReturnValue(opts?.genreMutations ?? [])
  };
  const artworkWorkflow: any = {
    search: vi.fn().mockResolvedValue([{ id: 'mb1', provider: 'coverartarchive' }]),
    buildPreview: vi.fn().mockResolvedValue({ matches: [] }),
    buildMutations: vi.fn().mockReturnValue(opts?.artworkMutations ?? [])
  };
  const workflowService: any = {
    getWorkflow: vi.fn((type: string) => {
      if (type === 'genre') {
        if (opts?.genreAvailable === false) throw new Error('Unsupported workflow type: genre');
        return genreWorkflow;
      }
      return artworkWorkflow;
    }),
    executeMutations: vi.fn().mockImplementation(async (mutations: unknown[]) => ({
      success: true,
      updatedCount: (mutations as unknown[]).length,
      failedCount: 0,
      deferredCount: 0,
      errors: []
    }))
  };
  const coverArtBufferService: any = {
    fetchBuffer: vi.fn().mockResolvedValue(Buffer.from('art'))
  };
  const service = new GapFillService({ workflowService, coverArtBufferService });
  return { service, workflowService, genreWorkflow, artworkWorkflow, coverArtBufferService };
};

describe('GapFillService', () => {
  it('skips songs with no gaps without touching providers or the journal', async () => {
    const { service, workflowService } = harness();
    const res = await service.fillGaps([
      song({ songId: 1, genre: 'Rock', artworkPath: 'nora://a' })
    ]);
    expect(res).toMatchObject({ updated: 0, skipped: 1, failed: 0, albumsProcessed: 1 });
    expect(workflowService.getWorkflow).not.toHaveBeenCalled();
    expect(workflowService.executeMutations).not.toHaveBeenCalled();
  });

  it('fills only empty genre and never overwrites existing genre', async () => {
    const { service, workflowService } = harness({
      genreMutations: [genreMutation(1, 'Rock'), genreMutation(2, 'Hacked')]
    });
    const res = await service.fillGaps([
      song({ songId: 1, genre: '', artworkPath: 'nora://a' }),
      song({ songId: 2, genre: 'Jazz', artworkPath: 'nora://b', path: '/tmp/b.mp3' })
    ]);
    expect(res.updated).toBe(1);
    const mutations = workflowService.executeMutations.mock.calls[0][0];
    expect(mutations).toHaveLength(1);
    expect(mutations[0].songId).toBe(1);
    expect(mutations[0].fields).toEqual([
      expect.objectContaining({ fieldId: 'genre', newValue: 'Rock' })
    ]);
    expect(workflowService.executeMutations.mock.calls[0][1]).toMatchObject({
      albumTitle: 'LP'
    });
  });

  it('attaches a validated artwork buffer only for songs missing artwork', async () => {
    const { service, workflowService, coverArtBufferService } = harness({
      artworkMutations: [artworkMutation(1, 'http://x/cover.jpg')]
    });
    const res = await service.fillGaps([
      song({ songId: 1, genre: 'Rock', path: '/tmp/a.mp3' }),
      song({ songId: 2, genre: 'Rock', artworkPath: 'nora://b', path: '/tmp/b.mp3' })
    ]);
    expect(res.updated).toBe(1);
    expect(coverArtBufferService.fetchBuffer).toHaveBeenCalledWith('http://x/cover.jpg');
    const mutations = workflowService.executeMutations.mock.calls[0][0];
    expect(mutations[0].artwork).toEqual({ buffer: Buffer.from('art') });
  });

  it('still fills artwork when the genre provider is not configured', async () => {
    const { service, workflowService } = harness({
      genreAvailable: false,
      artworkMutations: [artworkMutation(1, 'http://x/cover.jpg')]
    });
    const res = await service.fillGaps([song({ songId: 1 })]);
    expect(res.updated).toBe(1);
    expect(workflowService.executeMutations).toHaveBeenCalledTimes(1);
  });

  it('isolates album-less songs so unrelated tracks never share a candidate', async () => {
    const { service, workflowService } = harness({ genreMutations: [] });
    const res = await service.fillGaps([
      song({ songId: 1, album: '', title: 'Solo A', artworkPath: 'nora://a' }),
      song({ songId: 2, album: '', title: 'Solo B', artworkPath: 'nora://b' })
    ]);
    expect(res.albumsProcessed).toBe(2);
    expect(res.skipped).toBe(2);
    expect(workflowService.executeMutations).not.toHaveBeenCalled();
  });

  it('backfills caller-empty genre from the database instead of overwriting it', async () => {
    const { getSongsByIds } = await import('../../../db/queries/songs');
    vi.mocked(getSongsByIds).mockResolvedValueOnce([
      { id: 9, genres: [{ genre: { name: 'Existing' } }] }
    ] as any);
    const { service, workflowService } = harness({
      genreMutations: [genreMutation(9, 'Overwritten')]
    });
    const res = await service.fillGaps([
      song({ songId: 9, genre: '', artworkPath: 'nora://a', path: '/tmp/z.mp3' })
    ]);
    // Database says the song already has a genre: no genre mutation may fire.
    expect(workflowService.executeMutations).not.toHaveBeenCalled();
    expect(res.skipped).toBe(1);
  });

  it('rejects oversized selections instead of queueing hours of rate-limited work', async () => {
    const { service, workflowService } = harness();
    const many = Array.from({ length: 201 }, (_, i) => song({ songId: 100 + i }));
    await expect(service.fillGaps(many)).rejects.toThrow(/up to 200 songs/);
    expect(workflowService.executeMutations).not.toHaveBeenCalled();
  });

  it('skips artwork for album-less singles but still fills their genre', async () => {
    const { service, workflowService } = harness({
      genreMutations: [genreMutation(11, 'Rock')],
      artworkMutations: [artworkMutation(11, 'http://x/cover.jpg')]
    });
    const res = await service.fillGaps([
      song({ songId: 11, album: '', title: 'Solo', genre: '', path: '/tmp/s.mp3' })
    ]);
    expect(res.updated).toBe(1);
    const mutations = workflowService.executeMutations.mock.calls[0][0];
    expect(mutations).toHaveLength(1);
    expect(mutations[0].fields.map((f: any) => f.fieldId)).toEqual(['genre']);
    expect(mutations[0].artwork).toBeUndefined();
  });
});
