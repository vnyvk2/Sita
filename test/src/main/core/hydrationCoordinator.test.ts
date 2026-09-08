import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HydrationCoordinator } from '@main/core/hydrationCoordinator';

describe('HydrationCoordinator', () => {
  let coordinator: HydrationCoordinator;

  beforeEach(() => {
    coordinator = new HydrationCoordinator();
  });

  it('executes a task directly when not superseded', async () => {
    const execute = vi.fn().mockResolvedValue(['song1', 'song2']);

    const result = await coordinator.schedule(
      { generationToken: 1, listIdentity: 'songs', priority: 'target' },
      execute
    );

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['song1', 'song2']);
    expect(coordinator.getLatestGeneration('songs')).toBe(1);
  });

  it('immediately drops a task if generationToken < latestGeneration', async () => {
    coordinator.updateGeneration('songs', 5);

    const execute = vi.fn().mockResolvedValue(['data']);

    const result = await coordinator.schedule(
      { generationToken: 3, listIdentity: 'songs', priority: 'lookahead' },
      execute
    );

    expect(execute).not.toHaveBeenCalled();
    expect(result).toEqual({ cancelled: true, generationToken: 3 });
  });

  it('evicts queued tasks before execution when a newer generation arrives', async () => {
    let resolveFirstTask: (v: any) => void = () => {};
    const firstTaskPromise = new Promise((resolve) => {
      resolveFirstTask = resolve;
    });

    // Task 1: starts executing and holds the execution lock
    const p1 = coordinator.schedule(
      { generationToken: 1, listIdentity: 'songs', priority: 'target' },
      () => firstTaskPromise
    );

    // Task 2: queued behind Task 1 with generation 2
    const execute2 = vi.fn().mockResolvedValue('task2_result');
    const p2 = coordinator.schedule(
      { generationToken: 2, listIdentity: 'songs', priority: 'lookahead' },
      execute2
    );

    // Task 3: queued behind Task 2 with generation 3 -> supersedes Task 2!
    const execute3 = vi.fn().mockResolvedValue('task3_result');
    const p3 = coordinator.schedule(
      { generationToken: 3, listIdentity: 'songs', priority: 'target' },
      execute3
    );

    // Release Task 1 (which was gen 1, now superseded by gen 3)
    resolveFirstTask('task1_result');

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    // Task 1 completed after gen 3 arrived, so its results are dropped
    expect(r1).toEqual({ cancelled: true, generationToken: 1 });

    // Task 2 was in queue with gen 2 < 3, so its execution was skipped entirely
    expect(execute2).not.toHaveBeenCalled();
    expect(r2).toEqual({ cancelled: true, generationToken: 2 });

    // Task 3 had current generation 3, so it executed successfully
    expect(execute3).toHaveBeenCalledTimes(1);
    expect(r3).toBe('task3_result');
  });

  it('prioritizes target queries ahead of lookahead queries in queue', async () => {
    let resolveFirstTask: (v: any) => void = () => {};
    const firstTaskPromise = new Promise((resolve) => {
      resolveFirstTask = resolve;
    });

    // Task 1 locks execution
    const p1 = coordinator.schedule(
      { generationToken: 1, listIdentity: 'songs', priority: 'target' },
      () => firstTaskPromise
    );

    const executionOrder: string[] = [];

    // Task 2: lookahead with gen 1
    const p2 = coordinator.schedule(
      { generationToken: 1, listIdentity: 'songs', priority: 'lookahead' },
      async () => {
        executionOrder.push('lookahead');
        return 'lookahead_done';
      }
    );

    // Task 3: target with gen 1 (queued after lookahead, but has target priority)
    const p3 = coordinator.schedule(
      { generationToken: 1, listIdentity: 'songs', priority: 'target' },
      async () => {
        executionOrder.push('target');
        return 'target_done';
      }
    );

    resolveFirstTask('first_done');
    await Promise.all([p1, p2, p3]);

    // Target must execute before lookahead
    expect(executionOrder).toEqual(['target', 'lookahead']);
  });

  it('isolates different list identities completely', async () => {
    const pSongs = coordinator.schedule(
      { generationToken: 1, listIdentity: 'songs', priority: 'target' },
      async () => 'songs_data'
    );

    const pQueue = coordinator.schedule(
      { generationToken: 1, listIdentity: 'queue', priority: 'target' },
      async () => 'queue_data'
    );

    // Updating 'songs' generation does not affect 'queue'
    coordinator.updateGeneration('songs', 10);

    expect(coordinator.getLatestGeneration('songs')).toBe(10);
    expect(coordinator.getLatestGeneration('queue')).toBe(1);

    const [rSongs, rQueue] = await Promise.all([pSongs, pQueue]);
    expect(rQueue).toBe('queue_data');
  });
});
