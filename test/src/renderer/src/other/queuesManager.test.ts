import { QueuesManager } from '@renderer/other/queuesManager';
import storage from '@renderer/utils/localStorage';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Mock localStorage module
vi.mock('@renderer/utils/localStorage', () => ({
  default: {
    setLocalStorage: vi.fn(),
    queue: {
      getQueue: vi.fn(() => ({
        queues: [],
        currentQueueIndex: 0
      })),
      setQueue: vi.fn(),
      updateQueueData: vi.fn()
    }
  }
}));

// Mock store module
vi.mock('@renderer/store/store', () => ({
  store: {
    state: {
      localStorage: {
        queue: {
          queues: [],
          currentQueueIndex: 0
        }
      }
    },
    subscribe: vi.fn(() => vi.fn()),
    setState: vi.fn()
  },
  dispatch: vi.fn()
}));

describe('QueuesManager', () => {
  let manager: QueuesManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new QueuesManager();
    manager.initialize();
  });

  describe('toggleQueueLock', () => {
    test('should toggle lock status of a queue and return true', () => {
      const queue = manager.createQueue('Test Queue', [1, 2, 3]);
      expect(queue.getMetadata().isLocked).toBeUndefined();

      const result1 = manager.toggleQueueLock(queue.id);
      expect(result1).toBe(true);
      expect(queue.getMetadata().isLocked).toBe(true);

      const result2 = manager.toggleQueueLock(queue.id);
      expect(result2).toBe(true);
      expect(queue.getMetadata().isLocked).toBe(false);
    });

    test('should return false for invalid queueId', () => {
      const result = manager.toggleQueueLock('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('deleteQueue', () => {
    test('should delete an unlocked queue', () => {
      const q1 = manager.createQueue('Queue 1', [1]);
      const q2 = manager.createQueue('Queue 2', [2]);

      expect(manager.queues.length).toBe(2);
      manager.deleteQueue(q1.id);
      expect(manager.queues.length).toBe(1);
      expect(manager.queues[0].id).toBe(q2.id);
    });

    test('should NOT delete a locked queue', () => {
      const q1 = manager.createQueue('Queue 1', [1]);
      const q2 = manager.createQueue('Queue 2', [2]);
      manager.toggleQueueLock(q1.id);

      expect(manager.queues.length).toBe(2);
      manager.deleteQueue(q1.id);
      // Still 2 because q1 is locked
      expect(manager.queues.length).toBe(2);
      expect(manager.queues.find((q) => q.id === q1.id)).toBeDefined();
    });
  });

  describe('renameQueue', () => {
    test('should rename queue using partial metadata update without overwriting other metadata', () => {
      const q1 = manager.createQueue('Original Name', [1]);
      q1.setMetadata({ isLocked: true, queueType: 'album' });

      manager.renameQueue(q1.id, 'New Name');
      expect(q1.getMetadata().title).toBe('New Name');
      expect(q1.getMetadata().isLocked).toBe(true);
      expect(q1.getMetadata().queueType).toBe('album');
    });
  });

  describe('removeAllQueues', () => {
    test('Case 1: None locked -> removes background queues and preserves active queue', () => {
      const q1 = manager.createQueue('Queue 1', [1]);
      manager.createQueue('Queue 2', [2]);
      manager.createQueue('Queue 3', [3]);

      manager.switchQueue(0); // q1 is active
      const { deleted, kept } = manager.removeAllQueues();

      expect(deleted).toBe(2);
      expect(kept).toBe(1);
      expect(manager.queues.length).toBe(1);
      expect(manager.queues[0].id).toBe(q1.id);
      expect(manager.activeQueueIndex).toBe(0);
      expect(manager.getActiveQueue().id).toBe(q1.id);
    });

    test('Case 2: All locked -> removes nothing and keeps all queues', () => {
      const q1 = manager.createQueue('Queue 1', [1]);
      const q2 = manager.createQueue('Queue 2', [2]);
      manager.toggleQueueLock(q1.id);
      manager.toggleQueueLock(q2.id);

      const { deleted, kept } = manager.removeAllQueues();

      expect(deleted).toBe(0);
      expect(kept).toBe(2);
      expect(manager.queues.length).toBe(2);
    });

    test('Case 3: Active queue is locked -> remains active and preserves locked queues', () => {
      const q1 = manager.createQueue('Queue 1', [1]); // index 0 (unlocked)
      const q2 = manager.createQueue('Queue 2', [2]); // index 1 (locked)
      const q3 = manager.createQueue('Queue 3', [3]); // index 2 (unlocked)

      manager.toggleQueueLock(q2.id); // q2 is locked
      manager.switchQueue(1); // q2 is active

      const { deleted, kept } = manager.removeAllQueues();

      expect(deleted).toBe(2);
      expect(kept).toBe(1);
      expect(manager.queues.length).toBe(1);
      expect(manager.queues[0].id).toBe(q2.id);
      expect(manager.activeQueueIndex).toBe(0);
      expect(manager.getActiveQueue().id).toBe(q2.id);
    });

    test('Case 4: Active queue is unlocked -> preserves active queue and all locked queues', () => {
      const q1 = manager.createQueue('Queue 1', [1]); // index 0 (unlocked, active)
      const q2 = manager.createQueue('Queue 2', [2]); // index 1 (locked)
      const q3 = manager.createQueue('Queue 3', [3]); // index 2 (locked)
      const q4 = manager.createQueue('Queue 4', [4]); // index 3 (unlocked)

      manager.toggleQueueLock(q2.id);
      manager.toggleQueueLock(q3.id);
      manager.switchQueue(0); // q1 is active and unlocked

      const { deleted, kept } = manager.removeAllQueues();

      expect(deleted).toBe(1); // q4 removed
      expect(kept).toBe(3); // q1 (active), q2 (locked), q3 (locked)
      expect(manager.queues.length).toBe(3);
      expect(manager.activeQueueIndex).toBe(0);
      expect(manager.getActiveQueue().id).toBe(q1.id);
    });

    test('Event emissions: active queue survives -> queuesChanged emitted, activeQueueChanged NOT emitted', () => {
      const q1 = manager.createQueue('Queue 1', [1]);
      manager.createQueue('Queue 2', [2]);
      manager.switchQueue(0); // q1 is active

      const queuesChangedCb = vi.fn();
      const activeQueueChangedCb = vi.fn();
      manager.on('queuesChanged', queuesChangedCb);
      manager.on('activeQueueChanged', activeQueueChangedCb);

      manager.removeAllQueues();

      expect(queuesChangedCb).toHaveBeenCalledTimes(1);
      expect(activeQueueChangedCb).not.toHaveBeenCalled();
    });
  });

  describe('Lightweight Position Persistence & Recovery', () => {
    test('writes nora:playback-queue-position with songId on positionChange and does NOT invoke setLocalStorage', async () => {
      const q = manager.createQueue('Test Queue', [10, 20, 30]);
      const setItemSpy = vi.fn();
      const originalStorage = globalThis.localStorage;
      globalThis.localStorage = {
        setItem: setItemSpy,
        getItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(),
        length: 0
      } as unknown as Storage;

      try {
        q.moveToPosition(2);

        expect(setItemSpy).toHaveBeenCalledWith(
          'nora:playback-queue-position',
          expect.stringContaining(`"queueId":"${q.id}","index":2,"songId":30`)
        );
        expect(storage.setLocalStorage).not.toHaveBeenCalled();
        expect(storage.queue.setQueue).not.toHaveBeenCalled();
      } finally {
        globalThis.localStorage = originalStorage;
      }
    });

    test('restores position and reconciles drifted index using songId on initialize', () => {
      const originalStorage = globalThis.localStorage;
      globalThis.localStorage = {
        getItem: vi.fn((key: string) => {
          if (key === 'nora:playback-queue-position') {
            // Index drifted: saved index was 1, but songId 40 is actually at index 3
            return JSON.stringify({ queueId: 'saved-queue', index: 1, songId: 40, timestamp: Date.now() });
          }
          return null;
        }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(),
        length: 0
      } as unknown as Storage;

      try {
        (storage.queue.getQueue as any).mockReturnValue({
          queues: [
            {
              id: 'saved-queue',
              songIds: [10, 20, 30, 40, 50],
              position: 0
            }
          ],
          currentQueueIndex: 0
        });

        const newManager = new QueuesManager();
        newManager.initialize();

        expect(newManager.getActiveQueue().position).toBe(3);
      } finally {
        globalThis.localStorage = originalStorage;
      }
    });

    test('discards position key and avoids cross-queue contamination when queueId no longer exists', () => {
      const removeItemSpy = vi.fn();
      const originalStorage = globalThis.localStorage;
      globalThis.localStorage = {
        getItem: vi.fn((key: string) => {
          if (key === 'nora:playback-queue-position') {
            return JSON.stringify({ queueId: 'deleted-queue', index: 3, songId: 40 });
          }
          return null;
        }),
        setItem: vi.fn(),
        removeItem: removeItemSpy,
        clear: vi.fn(),
        key: vi.fn(),
        length: 0
      } as unknown as Storage;

      try {
        (storage.queue.getQueue as any).mockReturnValue({
          queues: [
            {
              id: 'surviving-queue',
              songIds: [10, 20, 30, 40, 50],
              position: 0
            }
          ],
          currentQueueIndex: 0
        });

        const newManager = new QueuesManager();
        newManager.initialize();

        // Must NOT contaminate surviving queue with deleted queue's position
        expect(newManager.getActiveQueue().position).toBe(0);
        expect(removeItemSpy).toHaveBeenCalledWith('nora:playback-queue-position');
      } finally {
        globalThis.localStorage = originalStorage;
      }
    });

    test('does NOT restore position on an empty queue', () => {
      const originalStorage = globalThis.localStorage;
      globalThis.localStorage = {
        getItem: vi.fn((key: string) => {
          if (key === 'nora:playback-queue-position') {
            return JSON.stringify({ queueId: 'empty-queue', index: 2, songId: 99 });
          }
          return null;
        }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(),
        length: 0
      } as unknown as Storage;

      try {
        (storage.queue.getQueue as any).mockReturnValue({
          queues: [
            {
              id: 'empty-queue',
              songIds: [],
              position: -1
            }
          ],
          currentQueueIndex: 0
        });

        const newManager = new QueuesManager();
        newManager.initialize();

        expect(newManager.getActiveQueue().position).toBe(-1);
      } finally {
        globalThis.localStorage = originalStorage;
      }
    });

    test('clears nora:playback-queue-position when the matching queue is deleted', () => {
      const q = manager.createQueue('To Delete', [10, 20]);
      const removeItemSpy = vi.fn();
      const originalStorage = globalThis.localStorage;
      globalThis.localStorage = {
        getItem: vi.fn((key: string) => {
          if (key === 'nora:playback-queue-position') {
            return JSON.stringify({ queueId: q.id, index: 1, songId: 20 });
          }
          return null;
        }),
        setItem: vi.fn(),
        removeItem: removeItemSpy,
        clear: vi.fn(),
        key: vi.fn(),
        length: 0
      } as unknown as Storage;

      try {
        manager.deleteQueue(q.id);
        expect(removeItemSpy).toHaveBeenCalledWith('nora:playback-queue-position');
      } finally {
        globalThis.localStorage = originalStorage;
      }
    });
  });
});
