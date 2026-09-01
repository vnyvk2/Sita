import { EventEmitter } from 'events';

import { describe, expect, it, vi } from 'vitest';

import type { Job, JobState, JobPriority } from '../../src/main/workers/types';

class DummyLoggingJob implements Job {
  id: string;
  type = 'dummyLogging';
  state: JobState = 'queued';
  priority: JobPriority = 'normal';
  retries = 0;

  constructor(public executeMock: () => void) {
    this.id = 'dummyLoggingJob';
  }

  async execute() {
    this.executeMock();
  }
}

class MockPaletteJob implements Job {
  id: string;
  type = 'palette';
  state: JobState = 'queued';
  priority: JobPriority = 'normal';
  retries = 0;

  constructor(public executeMock: () => void) {
    this.id = 'mockPaletteJob';
  }

  async execute() {
    this.executeMock();
  }
}

describe('JobScheduler Choreography (Event Bus)', () => {
  it('should trigger both PaletteJob and DummyLoggingJob when ASSET_CREATED:ARTWORK is emitted', async () => {
    const eventBus = new EventEmitter();

    const paletteJobExecuted = vi.fn();
    const dummyLoggingJobExecuted = vi.fn();

    // The scheduler mimics what ipc.ts does
    eventBus.on('ASSET_CREATED:ARTWORK', () => {
      // In a real scenario, ipc.ts queues PaletteJob
      const paletteJob = new MockPaletteJob(paletteJobExecuted);
      paletteJob.execute();
    });

    eventBus.on('ASSET_CREATED:ARTWORK', () => {
      // Dummy logging job reacting to the same event
      const dummyJob = new DummyLoggingJob(dummyLoggingJobExecuted);
      dummyJob.execute();
    });

    // ArtworkJob finishes and emits the event
    eventBus.emit('ASSET_CREATED:ARTWORK');

    // Both should have reacted independently
    expect(paletteJobExecuted).toHaveBeenCalledTimes(1);
    expect(dummyLoggingJobExecuted).toHaveBeenCalledTimes(1);
  });

  it('should successfully schedule and run a choreograph chain (ArtworkJob -> PaletteJob)', async () => {
    const { JobScheduler } = await import('../../src/main/workers/jobScheduler');
    const scheduler = new JobScheduler();
    scheduler.start();

    const firstJobExecuted = vi.fn();
    const secondJobExecuted = vi.fn();

    class TriggerJob implements Job {
      id = 'triggerJob';
      type = 'trigger';
      state: JobState = 'queued';
      priority: JobPriority = 'normal';
      retries = 0;

      async execute() {
        firstJobExecuted();
        scheduler.emit('ASSET_CREATED:ARTWORK', {
          albumId: 1,
          artworkId: 100,
          path: '/path/to/artwork.webp'
        });
      }
    }

    class ReactingJob implements Job {
      id = 'reactingJob';
      type = 'reacting';
      state: JobState = 'queued';
      priority: JobPriority = 'normal';
      retries = 0;

      async execute() {
        secondJobExecuted();
      }
    }

    // Register choreography
    scheduler.on('ASSET_CREATED:ARTWORK', (payload) => {
      expect(payload.artworkId).toBe(100);
      scheduler.enqueue(new ReactingJob());
    });

    // Enqueue the first job
    scheduler.enqueue(new TriggerJob());

    // Wait a short tick for execution chain
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(firstJobExecuted).toHaveBeenCalledTimes(1);
    expect(secondJobExecuted).toHaveBeenCalledTimes(1);

    scheduler.stop();
  });
});
