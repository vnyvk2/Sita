import { describe, expect, it } from 'vitest';

import { db } from '../../../db/db';
import { songs, metadataOverrides } from '../../../db/schema';
import { MetadataEventBus } from '../../events/MetadataEventBus';
import { MetadataFields } from '../../models/MetadataFieldId';
import { MetadataIdentity } from '../../models/MetadataIdentity';
import { MetadataKinds } from '../../models/MetadataKind';
import { MetadataPipeline } from '../../pipeline/MetadataPipeline';
import { MapperStage } from '../../pipeline/stages/MapperStage';
import { LocalMetadataProvider } from '../../providers/LocalMetadataProvider';
import { DefaultMetadataMergePolicy } from '../../providers/policies/DefaultMetadataMergePolicy';
import { UserMetadataProvider } from '../../providers/UserMetadataProvider';
import { DatabaseMetadataRepository } from '../../repository/DatabaseMetadataRepository';
import { LoaderRegistry } from '../../repository/LoaderRegistry';
import { UserMetadataRepository } from '../../repository/UserMetadataRepository';
import { MetadataSnapshotSerializer } from '../../serializers/MetadataSnapshotSerializer';
import { UserMetadataService } from '../../services/UserMetadataService';
import { MapperRegistry } from '../MapperRegistry';
import { SongMapper } from '../SongMapper';

describe('SongMapper — G1-01 discNumber / diskNumber mapping & round-trip', () => {
  const mapper = new SongMapper();

  it('maps dto.discNumber to MetadataFields.DiscNumber', () => {
    const entity = mapper.map({
      id: 1,
      title: 'Test Song',
      discNumber: 2
    });

    const field = entity.getField(MetadataFields.DiscNumber);
    expect(field).toBeDefined();
    expect(field?.value).toBe(2);
  });

  it('maps dto.diskNumber fallback to MetadataFields.DiscNumber when discNumber is absent', () => {
    const entity = mapper.map({
      id: 2,
      title: 'Test Song 2',
      diskNumber: 3
    });

    const field = entity.getField(MetadataFields.DiscNumber);
    expect(field).toBeDefined();
    expect(field?.value).toBe(3);
  });

  it('prefers dto.discNumber (override) over dto.diskNumber (db column) when both are present', () => {
    const entity = mapper.map({
      id: 3,
      title: 'Test Song 3',
      discNumber: 4,
      diskNumber: 1
    });

    const field = entity.getField(MetadataFields.DiscNumber);
    expect(field).toBeDefined();
    expect(field?.value).toBe(4);
  });

  it('maps dto.trackNumber to MetadataFields.TrackNumber', () => {
    const entity = mapper.map({
      id: 4,
      title: 'Test Song 4',
      trackNumber: 7
    });

    const field = entity.getField(MetadataFields.TrackNumber);
    expect(field).toBeDefined();
    expect(field?.value).toBe(7);
  });

  it('leaves DiscNumber and TrackNumber unset when neither is present in dto', () => {
    const entity = mapper.map({
      id: 5,
      title: 'Test Song 5'
    });

    expect(entity.getField(MetadataFields.DiscNumber)).toBeUndefined();
    expect(entity.getField(MetadataFields.TrackNumber)).toBeUndefined();
  });

  it('G1-01 regression: full save -> reload round-trip preserves discNumber overrides', async () => {
    await db.delete(metadataOverrides);
    await db.delete(songs);

    // 1. Seed database row with diskNumber: 1 (as stored in SQLite songs table)
    const [seeded] = await db
      .insert(songs)
      .values({
        title: 'Roundtrip Track',
        duration: 210.0,
        path: 'C:\\music\\track.mp3',
        diskNumber: 1,
        trackNumber: 5,
        fileCreatedAt: new Date(),
        fileModifiedAt: new Date()
      })
      .returning();

    const identity = new MetadataIdentity({
      entityKind: MetadataKinds.Song,
      entityId: seeded.id
    });

    // 2. Setup providers and pipeline
    const loaderRegistry = new LoaderRegistry();
    const dbRepo = new DatabaseMetadataRepository(loaderRegistry);
    const localProvider = new LocalMetadataProvider(dbRepo);
    await localProvider.initialize();

    const userRepo = new UserMetadataRepository(db);
    const userProvider = new UserMetadataProvider(userRepo);
    await userProvider.initialize();

    const eventBus = new MetadataEventBus();
    const userService = new UserMetadataService(userRepo, eventBus);

    const mapperRegistry = new MapperRegistry();
    mapperRegistry.register(new SongMapper());
    const pipeline = new MetadataPipeline({
      mapperRegistry,
      fieldRegistry: {} as any,
      validationPolicy: {} as any,
      conflictPolicy: {} as any,
      stages: [new MapperStage(mapperRegistry)]
    });
    const mergePolicy = new DefaultMetadataMergePolicy();

    // Verify baseline load before override: discNumber is 1 (from diskNumber)
    const localRes = await localProvider.fetch(identity);
    const initialMerged = mergePolicy.merge([localRes]);
    const initialEntity = await pipeline.processDTO(identity.entityKind, initialMerged);
    expect(initialEntity?.getField(MetadataFields.DiscNumber)?.value).toBe(1);

    // 3. User saves override for discNumber: 2
    await userService.setField(identity, 'discNumber', 2);

    // Verify persisted override in metadataOverrides table
    const storedOverrides = await userRepo.getOverrides(identity);
    expect(storedOverrides.find((o) => o.fieldId === 'discNumber')?.value).toBe(2);

    // 4. Reload through provider chain (LocalProvider + UserProvider) with merge
    const localResAfter = await localProvider.fetch(identity);
    const userResAfter = await userProvider.fetch(identity);
    const mergedAfter = mergePolicy.merge([localResAfter, userResAfter]);

    // 5. Map merged DTO into MetadataEntity via SongMapper
    const reloadedEntity = await pipeline.processDTO(identity.entityKind, mergedAfter);

    // 6. Assert discNumber override is loaded and serialized correctly
    const discField = reloadedEntity?.getField(MetadataFields.DiscNumber);
    expect(discField).toBeDefined();
    expect(discField?.value).toBe(2);

    const serialized = MetadataSnapshotSerializer.toDTO(reloadedEntity!);
    expect(serialized.fields.discNumber).toBeDefined();
    expect(serialized.fields.discNumber.value).toBe(2);

    // 7. Remove override and verify clean fallback back to DB baseline (1)
    await userService.removeOverride(identity, 'discNumber');
    const userResCleared = await userProvider.fetch(identity);
    const mergedCleared = mergePolicy.merge([localResAfter, userResCleared]);
    const clearedEntity = await pipeline.processDTO(identity.entityKind, mergedCleared);
    expect(clearedEntity?.getField(MetadataFields.DiscNumber)?.value).toBe(1);
  });
});
