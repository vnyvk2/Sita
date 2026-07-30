import { describe, it, expect, vi } from 'vitest';
import { PlaylistImportHistoryService } from '@main/playlistImport/services/PlaylistImportHistoryService';
import { InMemoryPlaylistImportHistoryRepository } from '@main/playlistImport/services/InMemoryPlaylistImportHistoryRepository';
import { PlaylistImportWorkflow } from '@main/playlistImport/workflow/PlaylistImportWorkflow';
import { PlaylistImportPipeline } from '@main/playlistImport/pipeline/PlaylistImportPipeline';
import { PlaylistImportService } from '@main/playlistImport/services/PlaylistImportService';
import { PlaylistImporterRegistry } from '@main/playlistImport/registry/PlaylistImporterRegistry';
import { M3UImporter } from '@main/playlistImport/importers/M3UImporter';
import { PlaylistPathResolver } from '@main/playlistImport/resolver/PlaylistPathResolver';
import { FilesystemVerifier } from '@main/playlistImport/verifier/FilesystemVerifier';
import { LibraryResolver } from '@main/playlistImport/resolver/LibraryResolver';
import { PlaylistImportPlanner } from '@main/playlistImport/planner/PlaylistImportPlanner';
import { PlaylistImportExecutor } from '@main/playlistImport/executor/PlaylistImportExecutor';
import type { FileSystemAccess } from '@main/playlistImport/interfaces/FileSystemAccess';
import type { LibraryLookup } from '@main/playlistImport/interfaces/LibraryLookup';
import type { PlaylistPersistence } from '@main/playlistImport/interfaces/PlaylistPersistence';
import type { TransactionRunner } from '@main/playlistImport/interfaces/TransactionRunner';

describe('PlaylistImportHistoryService & Session Tracking', () => {
  it('should track sessions during workflow execution and allow undoing an import', async () => {
    const registry = new PlaylistImporterRegistry();
    registry.register(new M3UImporter());

    const m3uContent = `#EXTM3U
#EXTINF:240,Queen - Bohemian Rhapsody
bohemian.mp3`;

    const mockFs: FileSystemAccess = {
      readFile: vi.fn(async () => m3uContent),
      exists: vi.fn(async () => true)
    };

    const mockLibrary: LibraryLookup = {
      findByCanonicalPath: vi.fn(async () => ({ id: 555, path: '/music/bohemian.mp3' }))
    };

    const mockPersistence: PlaylistPersistence = {
      createPlaylist: vi.fn(async () => 1234),
      addEntries: vi.fn(async () => {}),
      deletePlaylist: vi.fn(async () => {})
    };

    const mockTransactionRunner: TransactionRunner = {
      runInTransaction: vi.fn(async (work) => await work())
    };

    const historyRepo = new InMemoryPlaylistImportHistoryRepository();
    const importService = new PlaylistImportService(registry, mockFs);
    const pathResolver = new PlaylistPathResolver();
    const verifier = new FilesystemVerifier(mockFs);
    const libraryResolver = new LibraryResolver(mockLibrary);
    const planner = new PlaylistImportPlanner();
    const executor = new PlaylistImportExecutor(mockPersistence, mockTransactionRunner);

    const pipeline = new PlaylistImportPipeline(importService, pathResolver, verifier, libraryResolver, planner);
    const workflow = new PlaylistImportWorkflow(pipeline, executor, historyRepo);
    const historyService = new PlaylistImportHistoryService(historyRepo, mockPersistence);

    const plan = await workflow.createPlanFromFile('/music/playlists/rock.m3u');
    const result = await workflow.executePlan(plan);

    expect(result.playlistId).toBe(1234);

    const history = await historyService.listHistory();
    expect(history).toHaveLength(1);
    expect(history[0].playlistName).toBe('rock');
    expect(history[0].status).toBe('COMPLETED');
    expect(history[0].execution?.playlistId).toBe(1234);

    const undoSuccess = await historyService.undoImport(history[0].id);
    expect(undoSuccess).toBe(true);
    expect(mockPersistence.deletePlaylist).toHaveBeenCalledWith(1234);

    const updatedSession = await historyService.getSession(history[0].id);
    expect(updatedSession?.status).toBe('UNDONE');
  });

  it('should replay an import session by re-running workflow pipeline', async () => {
    const registry = new PlaylistImporterRegistry();
    registry.register(new M3UImporter());

    const m3uContent = `#EXTM3U
#EXTINF:240,Queen - Bohemian Rhapsody
bohemian.mp3`;

    const mockFs: FileSystemAccess = {
      readFile: vi.fn(async () => m3uContent),
      exists: vi.fn(async () => true)
    };

    const mockLibrary: LibraryLookup = {
      findByCanonicalPath: vi.fn(async () => ({ id: 555, path: '/music/bohemian.mp3' }))
    };

    let createdIdCounter = 2000;
    const mockPersistence: PlaylistPersistence = {
      createPlaylist: vi.fn(async () => createdIdCounter++),
      addEntries: vi.fn(async () => {}),
      deletePlaylist: vi.fn(async () => {})
    };

    const mockTransactionRunner: TransactionRunner = {
      runInTransaction: vi.fn(async (work) => await work())
    };

    const historyRepo = new InMemoryPlaylistImportHistoryRepository();
    const importService = new PlaylistImportService(registry, mockFs);
    const pathResolver = new PlaylistPathResolver();
    const verifier = new FilesystemVerifier(mockFs);
    const libraryResolver = new LibraryResolver(mockLibrary);
    const planner = new PlaylistImportPlanner();
    const executor = new PlaylistImportExecutor(mockPersistence, mockTransactionRunner);

    const pipeline = new PlaylistImportPipeline(importService, pathResolver, verifier, libraryResolver, planner);
    const workflow = new PlaylistImportWorkflow(pipeline, executor, historyRepo);
    const historyService = new PlaylistImportHistoryService(historyRepo, mockPersistence);

    const plan = await workflow.createPlanFromFile('/music/playlists/rock.m3u');
    const firstResult = await workflow.executePlan(plan);
    expect(firstResult.playlistId).toBe(2000);

    const history = await historyService.listHistory();
    const replayedResult = await historyService.replayImport(history[0].id, workflow);
    expect(replayedResult.playlistId).toBe(2001);
  });
});
