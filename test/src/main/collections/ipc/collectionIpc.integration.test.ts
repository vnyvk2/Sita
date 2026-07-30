import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../../../../../src/main/db/db';
import { playlists, playlistEntries } from '../../../../../src/main/db/schema';
import { eq } from 'drizzle-orm';
import { setupCollectionIpc } from '../../../../../src/main/collections/ipc/setupCollectionIpc';
import { PlaylistEngine } from '../../../../../src/main/collections/engine/PlaylistEngine';
import { UndoEngine } from '../../../../../src/main/collections/engine/UndoEngine';
import { PlaylistRepository } from '../../../../../src/main/collections/repositories/PlaylistRepository';
import { HierarchyService } from '../../../../../src/main/collections/engine/HierarchyService';
import { OperationExecutor } from '../../../../../src/main/collections/operations/OperationExecutor';
import { OperationJournalWriter } from '../../../../../src/main/collections/operations/OperationJournalWriter';
import { OperationRegistry } from '../../../../../src/main/collections/operations/OperationRegistry';
import { OperationJournalRepository } from '../../../../../src/main/collections/repositories/OperationJournalRepository';
import { MembershipService } from '../../../../../src/main/collections/membership/MembershipService';
import { registerDefaultOperations } from '../../../../../src/main/collections/setup';
import { ipcMain } from 'electron';
import { collectionEventBus } from '../../../../../src/main/collections/events/CollectionEventBus';

// Mock ipcMain.handle
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  app: {
    isPackaged: false,
    getPath: vi.fn().mockReturnValue('/mock/path'),
    getAppPath: vi.fn().mockReturnValue(process.cwd()),
  },
}));

describe('Collection IPC Integration', () => {
  let repository: PlaylistRepository;
  let engine: PlaylistEngine;
  let undoEngine: UndoEngine;
  let executor: OperationExecutor;
  let hierarchyService: HierarchyService;
  let sendMessageToRenderer: ReturnType<typeof vi.fn>;
  let handlers: Record<string, Function>;

  beforeEach(async () => {
    repository = new PlaylistRepository();
    hierarchyService = new HierarchyService();
    const journalWriter = new OperationJournalWriter();
    executor = new OperationExecutor(journalWriter);
    const membershipService = new MembershipService(repository);
    engine = new PlaylistEngine(repository, membershipService, executor);
    
    const registry = new OperationRegistry();
    registerDefaultOperations(registry, repository, hierarchyService);
    const journalRepo = new OperationJournalRepository();
    undoEngine = new UndoEngine(registry, journalRepo, executor, membershipService);

    sendMessageToRenderer = vi.fn();
    handlers = {};

    vi.mocked(ipcMain.handle).mockImplementation((channel: string, handler: any) => {
      handlers[channel] = handler;
    });

    setupCollectionIpc(engine, undoEngine, repository, hierarchyService, sendMessageToRenderer);

    await db.delete(playlistEntries);
    await db.delete(playlists);
  });

  afterEach(async () => {
    collectionEventBus.removeAllListeners();
    vi.clearAllMocks();
    await db.delete(playlistEntries);
    await db.delete(playlists);
  });

  it('should expose read APIs mapping to DTOs', async () => {
    const [{ insertId }] = await db.insert(playlists).values({
      name: 'Test Playlist',
      playlistType: 'standard',
    }).returning({ insertId: playlists.id });

    const getCollectionHandler = handlers['collections/read/getCollection'];
    const result = await getCollectionHandler(null, insertId);

    expect(result.id).toBe(insertId);
    expect(result.name).toBe('Test Playlist');
    expect(result.playlistType).toBe('standard');
    expect(result.itemCount).toBe(0);
    // Should be a DTO, so createdAt is a string
    expect(typeof result.createdAt).toBe('string');
  });

  it('should forward events to the renderer', async () => {
    const createFolderHandler = handlers['collections/write/createFolder'];
    
    // Trigger mutation
    const result = await createFolderHandler(null, { name: 'New Folder', parentId: null });
    
    expect(sendMessageToRenderer).toHaveBeenCalledWith('collections/event', expect.objectContaining({
      type: 'CollectionChanged',
      payload: {
        collectionId: result.id,
        action: 'create',
      }
    }));
  });

  it('should undo an operation across the IPC boundary', async () => {
    const createFolderHandler = handlers['collections/write/createFolder'];
    const undoHandler = handlers['collections/history/undo'];

    const result = await createFolderHandler(null, { name: 'Undoable Folder', parentId: null });
    const insertedId = result.id;

    // Verify it exists
    const beforeUndo = await db.select().from(playlists).where(eq(playlists.id, insertedId));
    expect(beforeUndo.length).toBe(1);

    // Call Undo
    await undoHandler(null, `local://playlist/${insertedId}`);

    // Verify it is gone
    const afterUndo = await db.select().from(playlists).where(eq(playlists.id, insertedId));
    expect(afterUndo.length).toBe(0);
  });

  it('Transaction rollback: reject, rollback, and emit no events on failure', async () => {
    const createFolderHandler = handlers['collections/write/createFolder'];

    // Mock engine to throw halfway through
    vi.spyOn(engine, 'createFolder').mockImplementationOnce(async () => {
      return await db.transaction(async (trx) => {
        await trx.insert(playlists).values({ name: 'Partial Folder', playlistType: 'folder' });
        throw new Error('Halfway failure');
      });
    });

    await expect(createFolderHandler(null, { name: 'Will Fail', parentId: null })).rejects.toThrow('Halfway failure');

    // Verify transaction rolled back
    const found = await db.select().from(playlists).where(eq(playlists.name, 'Partial Folder'));
    expect(found.length).toBe(0);

    // Verify renderer received no update event
    expect(sendMessageToRenderer).not.toHaveBeenCalled();
  });
});
