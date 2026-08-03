import { describe, expect, it, vi } from 'vitest';

vi.mock('@db/db', () => ({
  db: {
    query: {
      playlistEntries: {
        findMany: vi.fn().mockResolvedValue([
          { playlistId: 1, songId: 10, position: 1, addedAt: new Date() },
          { playlistId: 1, songId: 11, position: 2, addedAt: new Date() }
        ]),
        findFirst: vi.fn().mockResolvedValue({ playlistId: 1, songId: 10, position: 1 })
      },
      albumsSongs: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
      artistsSongs: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
      genresSongs: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) }
    },
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 2 }])
      })
    })
  }
}));

import { DatabaseMembershipRepository } from '@main/membership/repository/DatabaseMembershipRepository';

describe('DatabaseMembershipRepository', () => {
  it('should query playlist members with deterministic position ordering', async () => {
    const repository = new DatabaseMembershipRepository();
    const members = await repository.getMembers({ kind: 'playlist', id: 1 }, 'song');

    expect(members.length).toBe(2);
    expect(members[0].collectionKind).toBe('playlist');
    expect(members[0].memberId).toBe(10);
    expect(members[0].position).toBe(1);
    expect(members[1].memberId).toBe(11);
  });

  it('should check if collection contains member', async () => {
    const repository = new DatabaseMembershipRepository();
    const contains = await repository.contains({ kind: 'playlist', id: 1 }, { kind: 'song', id: 10 });

    expect(contains).toBe(true);
  });

  it('should count members in a collection', async () => {
    const repository = new DatabaseMembershipRepository();
    const count = await repository.countMembers({ kind: 'playlist', id: 1 }, 'song');

    expect(count).toBe(2);
  });
});
