import SongRowSkeleton from '@renderer/components/SongsPage/SongRowSkeleton';
import { DEFAULT_SCROLL_SEEK_CONFIG } from '@renderer/components/VirtualizedList';
import PlayerQueue from '@renderer/other/playerQueue';
import { hashSongIds } from '@renderer/queries/songs';
import { render } from '@testing-library/react';
// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';

describe('Queue Page Hardening & Order-Sensitive Identity Invariants', () => {
  describe('SongRowSkeleton Layout Stability', () => {
    it('renders a non-null 60px layout-stable skeleton for unhydrated queue rows (preventing 0px collapse)', () => {
      const { container } = render(
        <SongRowSkeleton index={0} height={60} isCompact={false} rowSize="normal" />
      );

      const skeleton = container.querySelector('.song-item.list-row');
      expect(skeleton).not.toBeNull();
      // h-13 (52px) + mb-2 (8px) = 60px height grid contract
      expect(skeleton?.className).toContain('h-13');
      expect(skeleton?.className).toContain('mb-2');
      expect(skeleton?.getAttribute('aria-hidden')).toBe('true');
    });

    it('provides DEFAULT_SCROLL_SEEK_CONFIG with calm enter and exit velocity thresholds', () => {
      expect(DEFAULT_SCROLL_SEEK_CONFIG).toBeDefined();
      expect(typeof DEFAULT_SCROLL_SEEK_CONFIG.enter).toBe('function');
      expect(typeof DEFAULT_SCROLL_SEEK_CONFIG.exit).toBe('function');
      // Velocity > 2500 px/s triggers calm seek mode
      expect(DEFAULT_SCROLL_SEEK_CONFIG.enter(3000)).toBe(true);
      expect(DEFAULT_SCROLL_SEEK_CONFIG.enter(2000)).toBe(false);
      // Velocity < 300 px/s exits seek mode
      expect(DEFAULT_SCROLL_SEEK_CONFIG.exit(200)).toBe(true);
      expect(DEFAULT_SCROLL_SEEK_CONFIG.exit(500)).toBe(false);
    });
  });

  describe('Queue Hydration Identity Versioning', () => {
    it('produces distinct hydration identity upon shuffle or reorder while preserving identity on playback advance', () => {
      const queue = new PlayerQueue([101, 102, 103, 104], 0, undefined, undefined, 'queue-test');
      const getQueueVersion = (q: PlayerQueue) =>
        `${q.id}:${q.structureVersion}:${q.membershipVersion}`;

      const initialVersion = getQueueVersion(queue);
      expect(initialVersion).toBe('queue-test:0:0');

      // Advancing playback does NOT change structureVersion or membershipVersion
      queue.moveToPosition(1);
      expect(getQueueVersion(queue)).toBe(initialVersion);

      queue.moveToNext();
      expect(getQueueVersion(queue)).toBe(initialVersion);

      // Shuffling changes structureVersion, producing a fresh hydration version
      queue.shuffle();
      const shuffledVersion = getQueueVersion(queue);
      expect(shuffledVersion).toBe('queue-test:1:0');
      expect(shuffledVersion).not.toBe(initialVersion);

      // Reordering via replaceQueue changes structureVersion again
      queue.replaceQueue([104, 103, 102, 101]);
      const reorderedVersion = getQueueVersion(queue);
      expect(reorderedVersion).toBe('queue-test:2:0');
      expect(reorderedVersion).not.toBe(shuffledVersion);
    });
  });

  describe('Order-Sensitive ID Hashing (hashSongIds)', () => {
    it('generates distinct hashes for identical ID sets with different sequence orders', () => {
      const forwardOrder = [1, 2, 3, 4, 5];
      const reversedOrder = [5, 4, 3, 2, 1];
      const shuffledOrder = [2, 4, 1, 5, 3];

      const hashForward = hashSongIds(forwardOrder);
      const hashReversed = hashSongIds(reversedOrder);
      const hashShuffled = hashSongIds(shuffledOrder);

      expect(hashForward).not.toBe(hashReversed);
      expect(hashForward).not.toBe(hashShuffled);
      expect(hashReversed).not.toBe(hashShuffled);

      // Idempotent for identical sequence
      expect(hashSongIds([1, 2, 3, 4, 5])).toBe(hashForward);
    });

    it('returns empty string for empty ID list', () => {
      expect(hashSongIds([])).toBe('');
    });
  });
});
