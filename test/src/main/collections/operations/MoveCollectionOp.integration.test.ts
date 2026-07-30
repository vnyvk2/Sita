import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../../../../../src/main/db/db';
import { playlists } from '../../../../../src/main/db/schema';
import { eq } from 'drizzle-orm';
import { MoveCollectionOp } from '../../../../../src/main/collections/operations/MoveCollectionOp';
import { PlaylistRepository } from '../../../../../src/main/collections/repositories/PlaylistRepository';
import { HierarchyService } from '../../../../../src/main/collections/engine/HierarchyService';
import { OperationExecutor } from '../../../../../src/main/collections/operations/OperationExecutor';
import { OperationJournal } from '../../../../../src/main/collections/operations/OperationJournal';
import { EventBus } from '../../../../../src/main/events/EventBus';

describe('MoveCollectionOp Integration', () => {
  let repository: PlaylistRepository;
  let hierarchyService: HierarchyService;
  let executor: OperationExecutor;
  let moveOp: MoveCollectionOp;

  beforeEach(async () => {
    // Clean up
    await db.delete(playlists);
    
    repository = new PlaylistRepository();
    hierarchyService = new HierarchyService();
    const eventBus = new EventBus();
    const journal = new OperationJournal(eventBus);
    executor = new OperationExecutor(journal, eventBus);
    moveOp = new MoveCollectionOp(repository, hierarchyService);
  });

  afterEach(async () => {
    await db.delete(playlists);
  });

  it('prevents cyclic moves (moving A under B when B is in A)', async () => {
    // Create Folder A
    const [folderA] = await db.insert(playlists).values({
      name: 'Folder A',
      playlistType: 'folder',
      parentId: null
    }).returning();

    // Create Folder B under A
    const [folderB] = await db.insert(playlists).values({
      name: 'Folder B',
      playlistType: 'folder',
      parentId: folderA.id
    }).returning();

    // Attempt to move A under B
    await expect(async () => {
      await db.transaction(async (trx) => {
        const ctx = { trx, membershipService: {} as any };
        await moveOp.execute({ playlistId: folderA.id, newParentId: folderB.id }, ctx);
      });
    }).rejects.toThrow(`Cannot move folder ${folderA.id} into its own descendant ${folderB.id}.`);

    // Verify valid move (B to Root) succeeds
    await db.transaction(async (trx) => {
      const ctx = { trx, membershipService: {} as any };
      await moveOp.execute({ playlistId: folderB.id, newParentId: null }, ctx);
    });

    const [movedFolderB] = await db.select().from(playlists).where(eq(playlists.id, folderB.id));
    expect(movedFolderB.parentId).toBeNull();
  });
});
