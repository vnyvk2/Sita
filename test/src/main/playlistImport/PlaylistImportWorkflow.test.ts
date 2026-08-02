import { describe, it, expect, vi } from 'vitest';
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
import type { PlaylistImportProgress } from '@main/playlistImport/models/PlaylistImportProgress';

describe('PlaylistImportWorkflow & PlaylistImportPipeline', () => {
  it('should orchestrate full pipeline via PlaylistImportPipeline abstraction', async () => {
    const registry = new PlaylistImporterRegistry();
    registry.register(new M3UImporter());

    const m3uContent = `#EXTM3U
#EXTINF:240,Queen - Bohemian Rhapsody
bohemian.mp3
#EXTINF:180,Missing Song
missing.mp3`;

    const mockFs: FileSystemAccess = {
      readFile: vi.fn(async () => m3uContent),
      exists: vi.fn(async (path: string) => path.includes('bohemian.mp3'))
    };

    const mockLibrary: LibraryLookup = {
      findByCanonicalPath: vi.fn(async (path: string) => {
        if (path.includes('bohemian.mp3')) {
          return { id: 777, path, title: 'Bohemian Rhapsody', artist: 'Queen' };
        }
        return null;
      })
    };

    const mockPersistence: PlaylistPersistence = {
      createPlaylist: vi.fn(async () => 999),
      addEntries: vi.fn(async () => {})
    };

    const mockTransactionRunner: TransactionRunner = {
      runInTransaction: vi.fn(async (work) => await work())
    };

    const importService = new PlaylistImportService(registry, mockFs);
    const pathResolver = new PlaylistPathResolver();
    const verifier = new FilesystemVerifier(mockFs);
    const libraryResolver = new LibraryResolver(mockLibrary);
    const planner = new PlaylistImportPlanner();
    const executor = new PlaylistImportExecutor(mockPersistence, mockTransactionRunner);

    const pipeline = new PlaylistImportPipeline(
      importService,
      pathResolver,
      verifier,
      libraryResolver,
      planner
    );

    const workflow = new PlaylistImportWorkflow(pipeline, executor);

    const progressLogs: PlaylistImportProgress[] = [];
    const plan = await workflow.createPlanFromFile(
      '/playlists/rock.m3u',
      undefined,
      (progress) => progressLogs.push(progress)
    );

    expect(plan.playlistName).toBe('rock');
    expect(plan.entries).toHaveLength(2);
    expect(plan.entries[0].decision).toBe('IMPORT');
    expect(plan.entries[1].decision).toBe('SKIP_MISSING');
    expect(progressLogs.map((p) => p.stage)).toContain('READING_FILE');
    expect(progressLogs.map((p) => p.stage)).toContain('MATCHING_LIBRARY');

    const result = await workflow.executePlan(plan);

    expect(result.playlistId).toBe(999);
    expect(result.importedSongIds).toEqual([777]);
    expect(mockPersistence.createPlaylist).toHaveBeenCalledWith('rock', undefined);
    expect(mockPersistence.addEntries).toHaveBeenCalled();
  });
});
