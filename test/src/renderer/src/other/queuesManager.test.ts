import { QueuesManager } from '@renderer/other/queuesManager';
import storage from '@renderer/utils/localStorage';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Mock localStorage module
vi.mock('@renderer/utils/localStorage', () => ({
  default: {
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
    subscribe: vi.fn(() => vi.fn())
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
    test('Case 1: None locked -> removes all queues and leaves one default empty queue', () => {
      manager.createQueue('Queue 1', [1]);
      manager.createQueue('Queue 2', [2]);
      manager.createQueue('Queue 3', [3]);

      const { deleted, kept } = manager.removeAllQueues();

      expect(deleted).toBe(3);
      expect(kept).toBe(0);
      expect(manager.queues.length).toBe(1);
      expect(manager.activeQueueIndex).toBe(0);
      expect(manager.queues[0].isEmpty).toBe(true);
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

    test('Case 3: Active queue is locked -> remains active after removal of unlocked queues', () => {
      const q1 = manager.createQueue('Queue 1', [1]); // index 0
      const q2 = manager.createQueue('Queue 2', [2]); // index 1
      const q3 = manager.createQueue('Queue 3', [3]); // index 2

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

    test('Case 4: Active queue is unlocked -> switches active to first surviving locked queue', () => {
      const q1 = manager.createQueue('Queue 1', [1]); // index 0 (unlocked, active)
      const q2 = manager.createQueue('Queue 2', [2]); // index 1 (locked)
      const q3 = manager.createQueue('Queue 3', [3]); // index 2 (locked)

      manager.toggleQueueLock(q2.id);
      manager.toggleQueueLock(q3.id);
      manager.switchQueue(0); // q1 is active

      const { deleted, kept } = manager.removeAllQueues();

      expect(deleted).toBe(1);
      expect(kept).toBe(2);
      expect(manager.queues.length).toBe(2);
      expect(manager.activeQueueIndex).toBe(0);
      expect(manager.getActiveQueue().id).toBe(q2.id);
    });

    test('Event emissions: active queue survives -> queuesChanged emitted, activeQueueChanged NOT emitted', () => {
      const q1 = manager.createQueue('Queue 1', [1]);
      manager.createQueue('Queue 2', [2]);
      manager.toggleQueueLock(q1.id);
      manager.switchQueue(0); // q1 is active and locked

      const queuesChangedCb = vi.fn();
      const activeQueueChangedCb = vi.fn();
      manager.on('queuesChanged', queuesChangedCb);
      manager.on('activeQueueChanged', activeQueueChangedCb);

      manager.removeAllQueues();

      expect(queuesChangedCb).toHaveBeenCalledTimes(1);
      expect(activeQueueChangedCb).not.toHaveBeenCalled();
    });

    test('Event emissions: active queue removed -> queuesChanged and activeQueueChanged emitted', () => {
      const q1 = manager.createQueue('Queue 1', [1]); // unlocked
      const q2 = manager.createQueue('Queue 2', [2]); // locked
      manager.toggleQueueLock(q2.id);
      manager.switchQueue(0); // q1 is active and unlocked

      const queuesChangedCb = vi.fn();
      const activeQueueChangedCb = vi.fn();
      manager.on('queuesChanged', queuesChangedCb);
      manager.on('activeQueueChanged', activeQueueChangedCb);

      manager.removeAllQueues();

      expect(queuesChangedCb).toHaveBeenCalledTimes(1);
      expect(activeQueueChangedCb).toHaveBeenCalledTimes(1);
    });

    test('Event emissions: all queues removed -> queuesChanged and activeQueueChanged emitted for fallback queue', () => {
      manager.createQueue('Queue 1', [1]);
      manager.createQueue('Queue 2', [2]);

      const queuesChangedCb = vi.fn();
      const activeQueueChangedCb = vi.fn();
      manager.on('queuesChanged', queuesChangedCb);
      manager.on('activeQueueChanged', activeQueueChangedCb);

      manager.removeAllQueues();

      expect(queuesChangedCb).toHaveBeenCalledTimes(1);
      expect(activeQueueChangedCb).toHaveBeenCalledTimes(1);
    });
  });
});
