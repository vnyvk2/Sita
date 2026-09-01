import { PlaylistAutomationEngine } from '@main/playlistAutomation/engine/PlaylistAutomationEngine';
import { PlaylistEventBus } from '@main/playlistAutomation/events/PlaylistEventBus';
import { AutomationScheduler } from '@main/playlistAutomation/scheduler/AutomationScheduler';
import type { PlaylistLink } from '@main/playlistSync/models/PlaylistLink';
import type { PlaylistSyncWorkflow } from '@main/playlistSync/workflow/PlaylistSyncWorkflow';
import type { SyncPreviewResult } from '@main/playlistSync/workflow/PlaylistSyncWorkflow';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Phase 12 — Event-Driven Automation & Background Synchronization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should publish and receive events via PlaylistEventBus', async () => {
    const bus = new PlaylistEventBus();
    const mockHandler = vi.fn();

    bus.subscribe(mockHandler);

    await bus.publish({
      id: 'event_1',
      type: 'SOURCE_FILE_CHANGED',
      timestamp: new Date(),
      sourceFile: '/playlists/rock.m3u'
    });

    expect(mockHandler).toHaveBeenCalledTimes(1);
    expect(mockHandler.mock.calls[0][0].sourceFile).toBe('/playlists/rock.m3u');
  });

  it('should debounce rapid event emissions in AutomationScheduler', async () => {
    const scheduler = new AutomationScheduler();
    const mockAction = vi.fn(async () => {});

    const event = {
      id: 'event_1',
      type: 'SOURCE_FILE_CHANGED' as const,
      timestamp: new Date(),
      sourceFile: '/playlists/rock.m3u'
    };

    scheduler.schedule(event, 500, mockAction);
    scheduler.schedule(event, 500, mockAction);
    scheduler.schedule(event, 500, mockAction);

    await vi.advanceTimersByTimeAsync(499);
    expect(mockAction).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5);
    expect(mockAction).toHaveBeenCalledTimes(1);
  });

  it('should trigger sync workflow execution autonomously upon event emission', async () => {
    const bus = new PlaylistEventBus();
    const scheduler = new AutomationScheduler();

    const link: PlaylistLink = {
      id: 'link_1',
      playlistId: 10,
      sourceFile: '/playlists/rock.m3u',
      format: 'm3u',
      lastImportedAt: new Date(),
      syncPolicy: 'ONE_WAY_SOURCE_WINS'
    };

    const mockPreview: SyncPreviewResult = {
      rawPlan: {
        linkId: 'link_1',
        playlistId: 10,
        sourceFile: '/playlists/rock.m3u',
        syncPolicy: 'ONE_WAY_SOURCE_WINS',
        hasChanges: true,
        additionsCount: 1,
        removalsCount: 0,
        operations: [{ type: 'ADD_SONG', songId: 101, reason: 'Source addition' }]
      },
      resolvedPlan: {
        linkId: 'link_1',
        playlistId: 10,
        sourceFile: '/playlists/rock.m3u',
        syncPolicy: 'ONE_WAY_SOURCE_WINS',
        hasChanges: true,
        additionsCount: 1,
        removalsCount: 0,
        operations: [{ type: 'ADD_SONG', songId: 101, reason: 'Source addition' }]
      },
      analysis: { conflicts: [], hasConflicts: false, hasManualConflicts: false },
      conflictSummary: {
        totalConflicts: 0,
        resolvedAutomatically: 0,
        manualConflicts: 0,
        ignoredConflicts: 0
      }
    };

    const mockWorkflow = {
      previewSync: vi.fn(async () => mockPreview),
      executeSyncPlan: vi.fn(async () => ({
        playlistId: 10,
        success: true,
        appliedAdditionsCount: 1,
        appliedRemovalsCount: 0,
        appliedMovesCount: 0,
        durationMs: 10
      }))
    } as unknown as PlaylistSyncWorkflow;

    const engine = new PlaylistAutomationEngine(bus, scheduler, mockWorkflow, async () => [200]);
    engine.registerLink(link);

    await bus.publish({
      id: 'event_1',
      type: 'SOURCE_FILE_CHANGED',
      timestamp: new Date(),
      sourceFile: '/playlists/rock.m3u'
    });

    await vi.advanceTimersByTimeAsync(600);

    expect(mockWorkflow.previewSync).toHaveBeenCalledWith(link, [200]);
    expect(mockWorkflow.executeSyncPlan).toHaveBeenCalledWith(mockPreview.resolvedPlan);

    engine.dispose();
  });
});
