import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../../../../../src/main/db/db';
import { playlists, playlistEntries } from '../../../../../src/main/db/schema';
import { eq } from 'drizzle-orm';
import { PlaylistRepository as CollectionReadRepository } from '../../../../../src/main/collections/repositories/PlaylistRepository';
import { PlaylistEngine } from '../../../../../src/main/collections/engine/PlaylistEngine';
import { HierarchyService } from '../../../../../src/main/collections/engine/HierarchyService';
import { OperationExecutor } from '../../../../../src/main/collections/operations/OperationExecutor';
import { UndoEngine } from '../../../../../src/main/collections/engine/UndoEngine';
import { MembershipService } from '../../../../../src/main/collections/membership/MembershipService';

describe('Collection Operations Integration Tests', () => {
  let repository: CollectionReadRepository;
  let hierarchyService: HierarchyService;
  let undoEngine: UndoEngine;
  let membershipService: MembershipService;
  let engine: PlaylistEngine;

  beforeEach(async () => {
    // Clear test database tables
    await db.delete(playlistEntries);
    await db.delete(playlists);

    repository = new CollectionReadRepository(db);
    hierarchyService = new HierarchyService(repository);
    await hierarchyService.buildTree();

    undoEngine = new UndoEngine();
    membershipService = new MembershipService();
    engine = new PlaylistEngine(repository, membershipService, new OperationExecutor(undoEngine), hierarchyService);
  });

  afterEach(async () => {
    await db.delete(playlistEntries);
    await db.delete(playlists);
  });

  it('Rename collection', async () => {
    const id = await engine.createPlaylist({ name: 'Old Name' });
    let dto = await repository.getCollection(id);
    expect(dto?.name).toBe('Old Name');

    await engine.rename({ collectionId: id, newName: 'New Name' });

    dto = await repository.getCollection(id);
    expect(dto?.name).toBe('New Name');
  });

  it('Delete collection', async () => {
    const id = await engine.createPlaylist({ name: 'Delete Me' });
    let dto = await repository.getCollection(id);
    expect(dto).toBeDefined();

    await engine.delete({ collectionIds: [id] });

    dto = await repository.getCollection(id);
    expect(dto).toBeUndefined();
  });

  it('Create folder', async () => {
    const id = await engine.createFolder({ name: 'My Folder' });
    const dto = await repository.getCollection(id);
    expect(dto).toBeDefined();
    expect(dto?.type).toBe('FOLDER');
    expect(dto?.name).toBe('My Folder');
  });

  it('Move collection', async () => {
    const parentId = await engine.createFolder({ name: 'Parent Folder' });
    const childId = await engine.createPlaylist({ name: 'Child Playlist' });
    
    await engine.move({ targetCollectionId: childId, destinationFolderId: parentId, insertAfterId: undefined });

    const dto = await repository.getCollection(childId);
    expect(dto?.parentId).toBe(parentId);
  });
});
