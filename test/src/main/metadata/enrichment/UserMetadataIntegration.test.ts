import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('@db/db', () => ({
  db: {}
}));

import { MetadataCache } from '@main/metadata/cache/MetadataCache';
import { MetadataEngine } from '@main/metadata/engine/MetadataEngine';
import { MetadataMergeEngine } from '@main/metadata/engine/MetadataMergeEngine';
import { MetadataEventBus } from '@main/metadata/events/MetadataEventBus';
import { AlbumMapper } from '@main/metadata/mappers/AlbumMapper';
import { ArtistMapper } from '@main/metadata/mappers/ArtistMapper';
import { GenreMapper } from '@main/metadata/mappers/GenreMapper';
import { MapperRegistry } from '@main/metadata/mappers/MapperRegistry';
import { PlaylistMapper } from '@main/metadata/mappers/PlaylistMapper';
import { SongMapper } from '@main/metadata/mappers/SongMapper';
import { CORE_FIELD_DEFINITIONS } from '@main/metadata/models/CoreFieldDefinitions';
import { MetadataContext } from '@main/metadata/models/MetadataContext';
import { MetadataIdentity } from '@main/metadata/models/MetadataIdentity';
import { MetadataKinds } from '@main/metadata/models/MetadataKind';
import { MetadataPipeline } from '@main/metadata/pipeline/MetadataPipeline';
import { MetadataQueryPlanner } from '@main/metadata/planner/MetadataQueryPlanner';
import { DefaultConflictPolicy } from '@main/metadata/policies/DefaultConflictPolicy';
import { DefaultValidationPolicy } from '@main/metadata/policies/DefaultValidationPolicy';
import { LocalMetadataProvider } from '@main/metadata/providers/LocalMetadataProvider';
import { DefaultMetadataMergePolicy } from '@main/metadata/providers/policies/DefaultMetadataMergePolicy';
import { UserMetadataProvider } from '@main/metadata/providers/UserMetadataProvider';
import { DefaultProviderExecutionStrategy } from '@main/metadata/providers/strategies/DefaultProviderExecutionStrategy';
import { DefaultProviderSelectionStrategy } from '@main/metadata/providers/strategies/DefaultProviderSelectionStrategy';
import { MetadataFieldRegistry } from '@main/metadata/registries/MetadataFieldRegistry';
import { MetadataProviderRegistry } from '@main/metadata/registries/MetadataProviderRegistry';
import { DatabaseMetadataRepository } from '@main/metadata/repository/DatabaseMetadataRepository';
import { LoaderRegistry } from '@main/metadata/repository/LoaderRegistry';
import { UserMetadataRepository } from '@main/metadata/repository/UserMetadataRepository';
import { UserMetadataService } from '@main/metadata/services/UserMetadataService';

describe('UserMetadataIntegration (Phase 10A Platform Verification)', () => {
  let engine: MetadataEngine;
  let userService: UserMetadataService;

  beforeEach(async () => {
    const eventBus = new MetadataEventBus();

    const mockSongLoader = {
      kind: MetadataKinds.Song,
      load: async (id: number | string) => ({
        id: Number(id),
        title: 'Original Embedded Title',
        year: 1999,
        artists: [{ artist: { id: 1, name: 'Embedded Artist' } }]
      }),
      loadMany: async (ids: (number | string)[]) =>
        ids.map((id) => ({
          id: Number(id),
          title: 'Original Embedded Title',
          year: 1999
        }))
    };

    const loaderRegistry = new LoaderRegistry([mockSongLoader as any]);
    const dbRepository = new DatabaseMetadataRepository(loaderRegistry);

    const localProvider = new LocalMetadataProvider(dbRepository);
    await localProvider.initialize();

    let overridesStore: Map<string, any> = new Map();

    const mockDb: any = {
      select: () => ({
        from: () => ({
          where: (condition: any) => ({
            then: (resolve: any) => {
              const list: any[] = [];
              for (const [key, val] of overridesStore.entries()) {
                const [kind, id, fieldId] = key.split(':');
                let stringValue: string | null = null;
                let numberValue: number | null = null;
                let booleanValue: boolean | null = null;
                let jsonValue: string | null = null;

                if (typeof val === 'string') stringValue = val;
                else if (typeof val === 'number') numberValue = val;
                else if (typeof val === 'boolean') booleanValue = val;
                else if (typeof val === 'object') jsonValue = JSON.stringify(val);

                list.push({
                  id: list.length + 1,
                  entityKind: kind,
                  entityId: id,
                  fieldId,
                  stringValue,
                  numberValue,
                  booleanValue,
                  jsonValue,
                  createdAt: new Date(),
                  updatedAt: new Date()
                });
              }
              resolve(list);
            }
          })
        })
      }),
      transaction: async (cb: any) => {
        const tx: any = {
          select: () => ({
            from: () => ({
              where: () => ({
                then: (resolve: any) => resolve([])
              })
            })
          }),
          insert: () => ({
            values: (val: any) => {
              const key = `${val.entityKind}:${val.entityId}:${val.fieldId}`;
              let value: any = val.stringValue ?? val.numberValue ?? val.booleanValue;
              if (val.jsonValue) value = JSON.parse(val.jsonValue);
              overridesStore.set(key, value);
              return Promise.resolve();
            }
          }),
          update: () => ({
            set: () => ({
              where: () => Promise.resolve()
            })
          }),
          delete: () => ({
            where: () => {
              if (overridesStore.has('song:301:title')) {
                overridesStore.delete('song:301:title');
              } else {
                overridesStore.clear();
              }
              return Promise.resolve();
            }
          })
        };
        return cb(tx);
      },
      delete: () => ({
        where: () => {
          if (overridesStore.has('song:301:title')) {
            overridesStore.delete('song:301:title');
          } else {
            overridesStore.clear();
          }
          return Promise.resolve();
        }
      })
    };

    const userRepo = new UserMetadataRepository(mockDb);
    const userProvider = new UserMetadataProvider(userRepo);
    await userProvider.initialize();

    const providerRegistry = new MetadataProviderRegistry();
    providerRegistry.register(localProvider);
    providerRegistry.register(userProvider);

    const selectionStrategy = new DefaultProviderSelectionStrategy();
    const executionStrategy = new DefaultProviderExecutionStrategy(eventBus);
    const mergePolicy = new DefaultMetadataMergePolicy();

    const mergeEngine = new MetadataMergeEngine({
      registry: providerRegistry,
      mergePolicy,
      selectionStrategy,
      executionStrategy
    });

    const mapperRegistry = new MapperRegistry();
    mapperRegistry.register(new SongMapper());
    mapperRegistry.register(new ArtistMapper());
    mapperRegistry.register(new AlbumMapper());
    mapperRegistry.register(new GenreMapper());
    mapperRegistry.register(new PlaylistMapper());

    const fieldRegistry = new MetadataFieldRegistry(CORE_FIELD_DEFINITIONS);
    const validationPolicy = new DefaultValidationPolicy();
    const conflictPolicy = new DefaultConflictPolicy();
    const context = new MetadataContext({ logger: console as any });

    const pipeline = new MetadataPipeline({
      mapperRegistry,
      fieldRegistry,
      validationPolicy,
      conflictPolicy,
      context
    });

    const cache = new MetadataCache();
    const planner = new MetadataQueryPlanner(dbRepository);

    engine = new MetadataEngine({
      executor: null as any,
      mergeEngine,
      planner,
      pipeline,
      cache,
      eventBus,
      context
    });

    userService = new UserMetadataService(userRepo, eventBus);
  });

  it('should merge user metadata overrides with priority 1000 and invalidate cache reactively on mutation', async () => {
    const identity = new MetadataIdentity({ entityKind: MetadataKinds.Song, entityId: 301 });

    // 1. Initial Load (embedded only)
    const initialEntity = await engine.load(identity);
    expect(initialEntity).not.toBeNull();
    expect(initialEntity?.getField<string>('title')?.value).toBe('Original Embedded Title');
    expect(initialEntity?.getField<number>('year')?.value).toBe(1999);
    expect(initialEntity?.getField<string>('language')?.value).toBeUndefined();

    // 2. Set batch overrides via UserMetadataService
    await userService.setOverrides(identity, {
      title: 'User Edited Masterpiece Title',
      language: 'Telugu',
      tags: ['favorite', 'rock'],
      comment: 'Best guitar solo ever!',
      rating: 5
    });

    // 3. Reload entity (cache should have been reactively invalidated by event bus)
    const updatedEntity = await engine.load(identity);
    expect(updatedEntity).not.toBeNull();

    // User override wins for title
    expect(updatedEntity?.getField<string>('title')?.value).toBe('User Edited Masterpiece Title');
    // Embedded year preserved
    expect(updatedEntity?.getField<number>('year')?.value).toBe(1999);
    // User fields added
    expect(updatedEntity?.getField<string>('language')?.value).toBe('Telugu');
    expect(updatedEntity?.getField<string[]>('tags')?.value).toEqual(['favorite', 'rock']);
    expect(updatedEntity?.getField<string>('comment')?.value).toBe('Best guitar solo ever!');
    expect(updatedEntity?.getField<number>('rating')?.value).toBe(5);

    // 4. Remove title override -> re-merges and falls back to embedded title
    await userService.removeOverride(identity, 'title');
    const fallbackEntity = await engine.load(identity);
    expect(fallbackEntity?.getField<string>('title')?.value).toBe('Original Embedded Title');
    expect(fallbackEntity?.getField<string>('language')?.value).toBe('Telugu');

    // 5. Clear all overrides -> fully reverts to embedded metadata
    await userService.clearOverrides(identity);
    const originalEntity = await engine.load(identity);
    expect(originalEntity?.getField<string>('title')?.value).toBe('Original Embedded Title');
    expect(originalEntity?.getField<string>('language')?.value).toBeUndefined();
  });
});
