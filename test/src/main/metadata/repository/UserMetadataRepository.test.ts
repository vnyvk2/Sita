import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('@db/db', () => ({
  db: {}
}));

import { MetadataIdentity } from '@main/metadata/models/MetadataIdentity';
import { MetadataKinds } from '@main/metadata/models/MetadataKind';
import { UserMetadataRepository } from '@main/metadata/repository/UserMetadataRepository';

describe('UserMetadataRepository', () => {
  let repository: UserMetadataRepository;
  let mockStore: any[];

  beforeEach(() => {
    mockStore = [];

    const mockDb: any = {
      select: () => ({
        from: () => ({
          where: (condition: any) => {
            // Find matches in mockStore
            const kind = condition?.kind ?? 'song';
            return {
              then: (resolve: any) => resolve(mockStore)
            };
          }
        })
      }),
      transaction: async (cb: any) => {
        const tx: any = {
          select: () => ({
            from: () => ({
              where: (cond: any) => ({
                then: (resolve: any) => resolve([])
              })
            })
          }),
          insert: () => ({
            values: (val: any) => {
              const existingIdx = mockStore.findIndex(
                (item) =>
                  item.entityKind === val.entityKind &&
                  item.entityId === val.entityId &&
                  item.fieldId === val.fieldId
              );
              if (existingIdx >= 0) {
                mockStore[existingIdx] = { ...mockStore[existingIdx], ...val };
              } else {
                mockStore.push({ id: mockStore.length + 1, ...val });
              }
              return {
                onConflictDoUpdate: (config: any) => {
                  if (config?.set && existingIdx >= 0) {
                    mockStore[existingIdx] = { ...mockStore[existingIdx], ...config.set };
                  }
                  return Promise.resolve();
                },
                then: (resolve: any) => resolve()
              };
            }
          }),
          update: () => ({
            set: () => ({
              where: () => Promise.resolve()
            })
          }),
          delete: () => ({
            where: () => Promise.resolve()
          })
        };
        return cb(tx);
      },
      delete: () => ({
        where: () => Promise.resolve()
      })
    };

    repository = new UserMetadataRepository(mockDb);
  });

  it('should save typed overrides and retrieve raw MetadataOverride records', async () => {
    const identity = new MetadataIdentity({ entityKind: MetadataKinds.Song, entityId: 101 });

    await repository.setOverrides(identity, {
      title: 'User Masterpiece',
      rating: 5,
      language: 'Telugu',
      tags: ['rock', 'energetic']
    });

    const overrides = await repository.getOverrides(identity);
    expect(overrides).toHaveLength(4);

    const titleOverride = overrides.find((o) => o.fieldId === 'title');
    expect(titleOverride?.value).toBe('User Masterpiece');

    const ratingOverride = overrides.find((o) => o.fieldId === 'rating');
    expect(ratingOverride?.value).toBe(5);

    const languageOverride = overrides.find((o) => o.fieldId === 'language');
    expect(languageOverride?.value).toBe('Telugu');

    const tagsOverride = overrides.find((o) => o.fieldId === 'tags');
    expect(tagsOverride?.value).toEqual(['rock', 'energetic']);
  });
});
