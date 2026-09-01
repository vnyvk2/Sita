import { beforeEach, describe, expect, it, vi } from 'vitest';

import { processSongsWithWorkerPool } from '../../core/songWorkerPool';
import reParseSong from '../../parseSong/reParseSong';
import removeSongsFromLibrary from '../../removeSongsFromLibrary';
import { resolveOrCreateMusicFolders } from '../folderHierarchy';
import { LibraryReconciler } from '../LibraryReconciler';

vi.mock('../folderHierarchy', () => ({
  resolveOrCreateMusicFolders: vi.fn()
}));

vi.mock('../../core/songWorkerPool', () => ({
  processSongsWithWorkerPool: vi.fn()
}));

vi.mock('../../parseSong/reParseSong', () => ({
  default: vi.fn()
}));

vi.mock('../../removeSongsFromLibrary', () => ({
  default: vi.fn()
}));

vi.mock('@main/db/db', () => ({
  db: {}
}));

describe('LibraryReconciler', () => {
  let reconciler: LibraryReconciler;
  const root = { id: 1, path: 'C:\\Music' };

  beforeEach(() => {
    vi.clearAllMocks();
    reconciler = new LibraryReconciler();
  });

  describe('reconcileAdded', () => {
    it('should create folder hierarchy and dispatch eligible songs to worker pool', async () => {
      const added = [
        {
          path: 'C:\\Music\\Rock\\Song1.mp3',
          fileModifiedAt: new Date(),
          rootId: 1,
          dirPath: 'C:\\Music\\Rock'
        },
        {
          path: 'C:\\Music\\Jazz\\Song2.mp3',
          fileModifiedAt: new Date(),
          rootId: 1,
          dirPath: 'C:\\Music\\Jazz'
        }
      ];

      const folderMap = new Map<string, number>();
      folderMap.set('c:\\music\\rock', 10);
      folderMap.set('c:\\music\\jazz', 20);

      vi.mocked(resolveOrCreateMusicFolders).mockResolvedValue(folderMap as any);
      vi.mocked(processSongsWithWorkerPool).mockResolvedValue({
        successCount: 2,
        errorCount: 0,
        errors: []
      });

      const onProgress = vi.fn();
      const result = await reconciler.reconcileAdded(added, [root], {
        onProgress,
        platform: 'win32'
      });

      expect(resolveOrCreateMusicFolders).toHaveBeenCalled();
      expect(processSongsWithWorkerPool).toHaveBeenCalledWith(
        [
          { songPath: 'C:\\Music\\Rock\\Song1.mp3', folderId: 10 },
          { songPath: 'C:\\Music\\Jazz\\Song2.mp3', folderId: 20 }
        ],
        undefined,
        expect.any(Function)
      );
      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(0);
    });

    it('should record an error if a folder ID cannot be resolved', async () => {
      const added = [
        {
          path: 'C:\\Music\\Unknown\\Song1.mp3',
          fileModifiedAt: new Date(),
          rootId: 1,
          dirPath: 'C:\\Music\\Unknown'
        }
      ];

      // Return empty folder map (resolution failed)
      vi.mocked(resolveOrCreateMusicFolders).mockResolvedValue(new Map());

      const result = await reconciler.reconcileAdded(added, [root], { platform: 'win32' });

      expect(result.successCount).toBe(0);
      expect(result.errorCount).toBe(1);
      expect(result.errors[0].error).toContain('Unable to resolve folder ID');
      expect(processSongsWithWorkerPool).not.toHaveBeenCalled();
    });

    it('should return cancelled: true when AbortSignal triggers', async () => {
      const added = [
        {
          path: 'C:\\Music\\Song1.mp3',
          fileModifiedAt: new Date(),
          rootId: 1,
          dirPath: 'C:\\Music'
        }
      ];

      const controller = new AbortController();
      controller.abort();

      const result = await reconciler.reconcileAdded(added, [root], {
        abortSignal: controller.signal
      });

      expect(result.cancelled).toBe(true);
      expect(resolveOrCreateMusicFolders).not.toHaveBeenCalled();
    });

    it('should handle empty added list without errors', async () => {
      const result = await reconciler.reconcileAdded([], [root]);

      expect(result.successCount).toBe(0);
      expect(result.errorCount).toBe(0);
    });
  });

  describe('reconcileModified', () => {
    it('should re-parse each modified song and report progress', async () => {
      const modified = [
        { path: 'C:\\Music\\Mod1.mp3', fileModifiedAt: new Date(), rootId: 1 },
        { path: 'C:\\Music\\Mod2.mp3', fileModifiedAt: new Date(), rootId: 1 }
      ];

      vi.mocked(reParseSong).mockResolvedValue({ id: 1, title: 'Mod' } as any);

      const onProgress = vi.fn();
      const result = await reconciler.reconcileModified(modified, { onProgress });

      expect(reParseSong).toHaveBeenCalledTimes(2);
      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(0);
      expect(onProgress).toHaveBeenCalledTimes(2);
    });

    it('should record individual reParseSong failures', async () => {
      const modified = [
        { path: 'C:\\Music\\Good.mp3', fileModifiedAt: new Date(), rootId: 1 },
        { path: 'C:\\Music\\Bad.mp3', fileModifiedAt: new Date(), rootId: 1 }
      ];

      vi.mocked(reParseSong).mockImplementation(async (path) => {
        if (path.includes('Bad.mp3')) throw new Error('Reparse failed');
        return { id: 1 } as any;
      });

      const result = await reconciler.reconcileModified(modified);

      expect(result.successCount).toBe(1);
      expect(result.errorCount).toBe(1);
      expect(result.errors[0]).toEqual({
        path: 'C:\\Music\\Bad.mp3',
        error: 'Reparse failed'
      });
    });

    it('should abort cleanly when AbortSignal triggers mid-modification', async () => {
      const modified = [
        { path: 'C:\\Music\\Mod1.mp3', fileModifiedAt: new Date(), rootId: 1 },
        { path: 'C:\\Music\\Mod2.mp3', fileModifiedAt: new Date(), rootId: 1 }
      ];

      const controller = new AbortController();
      vi.mocked(reParseSong).mockImplementation(async () => {
        controller.abort();
        return { id: 1 } as any;
      });

      const result = await reconciler.reconcileModified(modified, {
        abortSignal: controller.signal
      });

      expect(result.cancelled).toBe(true);
      expect(reParseSong).toHaveBeenCalledTimes(1);
    });
  });

  describe('reconcileRemoved', () => {
    it('should remove songs in batches and report progress', async () => {
      const removed = [
        { id: 1, path: 'C:\\Music\\Del1.mp3', fileModifiedAt: new Date(), folderId: 1 },
        { id: 2, path: 'C:\\Music\\Del2.mp3', fileModifiedAt: new Date(), folderId: 1 }
      ];

      vi.mocked(removeSongsFromLibrary).mockResolvedValue({ success: true } as any);

      const onProgress = vi.fn();
      const result = await reconciler.reconcileRemoved(removed, { batchSize: 1, onProgress });

      expect(removeSongsFromLibrary).toHaveBeenCalledTimes(2);
      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(0);
      expect(onProgress).toHaveBeenCalledTimes(2);
    });

    it('should record batch removal errors when removeSongsFromLibrary fails', async () => {
      const removed = [
        { id: 1, path: 'C:\\Music\\Del1.mp3', fileModifiedAt: new Date(), folderId: 1 }
      ];

      vi.mocked(removeSongsFromLibrary).mockResolvedValue({
        success: false,
        message: 'DB lock during delete'
      } as any);

      const result = await reconciler.reconcileRemoved(removed);

      expect(result.successCount).toBe(0);
      expect(result.errorCount).toBe(1);
      expect(result.errors[0].error).toBe('DB lock during delete');
    });

    it('should handle empty removed list cleanly', async () => {
      const result = await reconciler.reconcileRemoved([]);

      expect(result.successCount).toBe(0);
      expect(result.errorCount).toBe(0);
      expect(removeSongsFromLibrary).not.toHaveBeenCalled();
    });
  });
});
