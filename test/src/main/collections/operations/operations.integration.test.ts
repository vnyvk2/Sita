import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { HierarchyService } from '../../../../../src/main/collections/engine/HierarchyService';
import { PlaylistEngine } from '../../../../../src/main/collections/engine/PlaylistEngine';
import { MembershipCache } from '../../../../../src/main/collections/membership/MembershipCache';
import { MembershipService } from '../../../../../src/main/collections/membership/MembershipService';
import { OperationExecutor } from '../../../../../src/main/collections/operations/OperationExecutor';
import { OperationJournalWriter } from '../../../../../src/main/collections/operations/OperationJournalWriter';
import { PlaylistRepository } from '../../../../../src/main/collections/repositories/PlaylistRepository';
import { db } from '../../../../../src/main/db/db';
import { playlists, playlistEntries } from '../../../../../src/main/db/schema';

describe('Collection Operations Integration Tests', () => {
  let repository: PlaylistRepository;
  let hierarchyService: HierarchyService;
  let membershipService: MembershipService;
  let engine: PlaylistEngine;

  beforeEach(async () => {
    // Clear test database tables
    await db.delete(playlistEntries);
    await db.delete(playlists);

    repository = new PlaylistRepository();
    hierarchyService = new HierarchyService();
    const journalWriter = new OperationJournalWriter();
    const executor = new OperationExecutor(journalWriter);
    const membershipCache = new MembershipCache();
    membershipService = new MembershipService(membershipCache, []);
    engine = new PlaylistEngine(repository, membershipService, executor, hierarchyService);
  });

  afterEach(async () => {
    await db.delete(playlistEntries);
    await db.delete(playlists);
  });

  it('Rename collection', async () => {
    const id = await engine.createPlaylist({ name: 'Old Name' });
    let dto = await repository.getById(id);
    expect(dto?.name).toBe('Old Name');

    await engine.renamePlaylist({ playlistId: id, newName: 'New Name' });

    dto = await repository.getById(id);
    expect(dto?.name).toBe('New Name');
  });

  it('Delete collection', async () => {
    const id = await engine.createPlaylist({ name: 'Delete Me' });
    let dto = await repository.getById(id);
    expect(dto).toBeDefined();

    await engine.deletePlaylist({ playlistId: id });

    dto = await repository.getById(id);
    expect(dto).toBeNull();
  });

  it('Create folder', async () => {
    const id = await engine.createFolder({ name: 'My Folder' });
    const dto = await repository.getById(id);
    expect(dto).toBeDefined();
    expect(dto?.playlistType).toBe('folder');
    expect(dto?.name).toBe('My Folder');
  });

  it('Move collection', async () => {
    const parentId = await engine.createFolder({ name: 'Parent Folder' });
    const childId = await engine.createPlaylist({ name: 'Child Playlist' });

    await engine.moveCollection({ playlistIds: [childId], targetParentId: parentId });

    const dto = await repository.getById(childId);
    expect(dto?.parentId).toBe(parentId);
  });
});
