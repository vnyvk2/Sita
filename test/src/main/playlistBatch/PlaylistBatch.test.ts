import type { BatchItem } from '@main/playlistBatch/models/BatchItem';
import { PlaylistBatchOrchestrator } from '@main/playlistBatch/orchestrator/PlaylistBatchOrchestrator';
import { PlaylistBatchPlanner } from '@main/playlistBatch/planner/PlaylistBatchPlanner';
import { PlaylistDependencyGraph } from '@main/playlistBatch/planner/PlaylistDependencyGraph';
import type { PlaylistImportWorkflow } from '@main/playlistImport/workflow/PlaylistImportWorkflow';
import { describe, it, expect, vi } from 'vitest';

describe('Phase 14 — Batch Operations & Multi-Playlist Orchestration Refinements', () => {
  it('should compute structured ExecutionLevel metadata for parallel dependency execution', () => {
    const graph = new PlaylistDependencyGraph();

    const items: BatchItem[] = [
      {
        id: 'item_gym',
        action: 'IMPORT',
        sourceFile: 'gym.m3u',
        status: 'PENDING',
        dependencies: ['item_workout']
      },
      {
        id: 'item_workout',
        action: 'IMPORT',
        sourceFile: 'workout.m3u',
        status: 'PENDING',
        dependencies: ['item_rock']
      },
      {
        id: 'item_rock',
        action: 'IMPORT',
        sourceFile: 'rock.m3u',
        status: 'PENDING',
        dependencies: []
      },
      {
        id: 'item_pop',
        action: 'IMPORT',
        sourceFile: 'pop.m3u',
        status: 'PENDING',
        dependencies: []
      }
    ];

    const levels = graph.computeExecutionLevels(items);

    // Level 0: independent items (rock & pop)
    expect(levels[0].level).toBe(0);
    expect(levels[0].items).toEqual(['item_rock', 'item_pop']);
    expect(levels[0].parallelizable).toBe(true);

    // Level 1: depends on rock (workout)
    expect(levels[1].level).toBe(1);
    expect(levels[1].items).toEqual(['item_workout']);
    expect(levels[1].parallelizable).toBe(false);

    // Level 2: depends on workout (gym)
    expect(levels[2].level).toBe(2);
    expect(levels[2].items).toEqual(['item_gym']);
  });

  it('should create batch execution plan with executionLevels metadata and orchestrate execution', async () => {
    const graph = new PlaylistDependencyGraph();
    const planner = new PlaylistBatchPlanner(graph);

    const mockImportWorkflow = {
      createPlanFromFile: vi.fn(async () => ({
        playlistName: 'rock',
        statistics: {
          totalEntries: 2,
          importedEntries: 2,
          skippedEntries: 0,
          missingEntries: 0,
          notInLibraryEntries: 0,
          invalidEntries: 0,
          warningCount: 0,
          plannedImportPercentage: 100
        },
        warnings: [],
        entries: [{ filePath: 'song1.mp3' }, { filePath: 'song2.mp3' }] as any
      })),
      executePlan: vi.fn(async () => ({
        playlistId: 101,
        importedSongIds: [1, 2],
        skippedEntriesCount: 0,
        success: true,
        durationMs: 15
      }))
    } as unknown as PlaylistImportWorkflow;

    const orchestrator = new PlaylistBatchOrchestrator(mockImportWorkflow);

    const items: BatchItem[] = [
      {
        id: 'item_1',
        action: 'IMPORT',
        sourceFile: 'rock.m3u',
        status: 'PENDING',
        dependencies: []
      },
      { id: 'item_2', action: 'IMPORT', sourceFile: 'pop.m3u', status: 'PENDING', dependencies: [] }
    ];

    const plan = planner.createBatchPlan(items, 'CONTINUE_ON_ERROR');
    expect(plan.executionOrder).toHaveLength(2);
    expect(plan.executionLevels).toHaveLength(1);
    expect(plan.executionLevels[0].items).toEqual(['item_1', 'item_2']);

    const summary = await orchestrator.executeBatchPlan(plan);

    expect(summary.totalPlaylists).toBe(2);
    expect(summary.successfulCount).toBe(2);
    expect(summary.failedCount).toBe(0);
    expect(summary.importedSongsCount).toBe(4);
    expect(mockImportWorkflow.createPlanFromFile).toHaveBeenCalledTimes(2);
  });

  it('should coalesce events by muting eventBus during batch and unmuting at completion', async () => {
    const graph = new PlaylistDependencyGraph();
    const planner = new PlaylistBatchPlanner(graph);

    const mockImportWorkflow = {
      createPlanFromFile: vi.fn(async () => ({
        playlistName: 'coalesce_test',
        statistics: {
          totalEntries: 1,
          importedEntries: 1,
          skippedEntries: 0,
          missingEntries: 0,
          notInLibraryEntries: 0,
          invalidEntries: 0,
          warningCount: 0,
          plannedImportPercentage: 100
        },
        warnings: [],
        entries: [{ filePath: 'song1.mp3' }] as any
      })),
      executePlan: vi.fn(async () => ({
        playlistId: 102,
        importedSongIds: [1],
        skippedEntriesCount: 0,
        success: true,
        durationMs: 10
      }))
    } as unknown as PlaylistImportWorkflow;

    const mockEventBus = {
      mute: vi.fn(),
      unmute: vi.fn()
    } as any;

    const orchestrator = new PlaylistBatchOrchestrator(
      mockImportWorkflow,
      undefined,
      undefined,
      mockEventBus
    );

    const items: BatchItem[] = [
      { id: 'item_1', action: 'IMPORT', sourceFile: 'test.m3u', status: 'PENDING', dependencies: [] }
    ];
    const plan = planner.createBatchPlan(items, 'CONTINUE_ON_ERROR');

    await orchestrator.executeBatchPlan(plan);

    expect(mockEventBus.mute).toHaveBeenCalledTimes(1);
    expect(mockEventBus.unmute).toHaveBeenCalledTimes(1);
    expect(mockEventBus.unmute).toHaveBeenCalledWith(true);
  });

  it('should skip playlists with case-insensitive name conflicts without aborting other playlists', async () => {
    const graph = new PlaylistDependencyGraph();
    const planner = new PlaylistBatchPlanner(graph);

    const mockImportWorkflow = {
      createPlanFromFile: vi.fn(async (file: string) => ({
        playlistName: file.includes('conflict') ? 'Workout Mix' : 'Chill Vibes',
        statistics: {
          totalEntries: 1,
          importedEntries: 1,
          skippedEntries: 0,
          missingEntries: 0,
          notInLibraryEntries: 0,
          invalidEntries: 0,
          warningCount: 0,
          plannedImportPercentage: 100
        },
        warnings: [],
        entries: [{ filePath: 'song.mp3' }] as any
      })),
      executePlan: vi.fn(async () => ({
        playlistId: 103,
        importedSongIds: [1],
        skippedEntriesCount: 0,
        success: true,
        durationMs: 10
      }))
    } as unknown as PlaylistImportWorkflow;

    const mockRepo = {
      existsByName: vi.fn(async (name: string) => name.toLowerCase() === 'workout mix')
    } as any;

    const orchestrator = new PlaylistBatchOrchestrator(
      mockImportWorkflow,
      undefined,
      mockRepo
    );

    const items: BatchItem[] = [
      { id: 'item_1', action: 'IMPORT', sourceFile: 'conflict.m3u', status: 'PENDING', dependencies: [] },
      { id: 'item_2', action: 'IMPORT', sourceFile: 'chill.m3u', status: 'PENDING', dependencies: [] }
    ];
    const plan = planner.createBatchPlan(items, 'CONTINUE_ON_ERROR');

    const summary = await orchestrator.executeBatchPlan(plan);

    expect(summary.totalPlaylists).toBe(2);
    expect(summary.successfulCount).toBe(1);
    expect(summary.skippedCount).toBe(1);
    expect(summary.conflictNames).toEqual(['Workout Mix']);
    expect(mockImportWorkflow.executePlan).toHaveBeenCalledTimes(1);
  });

  it('should skip empty playlists (0 entries) and record them in failure details', async () => {
    const graph = new PlaylistDependencyGraph();
    const planner = new PlaylistBatchPlanner(graph);

    const mockImportWorkflow = {
      createPlanFromFile: vi.fn(async () => ({
        playlistName: 'empty_list',
        statistics: {
          totalEntries: 0,
          importedEntries: 0,
          skippedEntries: 0,
          missingEntries: 0,
          notInLibraryEntries: 0,
          invalidEntries: 0,
          warningCount: 0,
          plannedImportPercentage: 0
        },
        warnings: [],
        entries: []
      })),
      executePlan: vi.fn()
    } as unknown as PlaylistImportWorkflow;

    const orchestrator = new PlaylistBatchOrchestrator(mockImportWorkflow);

    const items: BatchItem[] = [
      { id: 'item_empty', action: 'IMPORT', sourceFile: 'empty.m3u', status: 'PENDING', dependencies: [] }
    ];
    const plan = planner.createBatchPlan(items, 'CONTINUE_ON_ERROR');

    const summary = await orchestrator.executeBatchPlan(plan);

    expect(summary.totalPlaylists).toBe(1);
    expect(summary.successfulCount).toBe(0);
    expect(summary.skippedCount).toBe(1);
    expect(summary.failedDetails).toEqual([
      { file: 'empty.m3u', reason: 'Empty playlist (0 tracks)' }
    ]);
    expect(mockImportWorkflow.executePlan).not.toHaveBeenCalled();
  });

  it('should isolate failures so that a corrupted file does not prevent subsequent files from importing', async () => {
    const graph = new PlaylistDependencyGraph();
    const planner = new PlaylistBatchPlanner(graph);

    const mockImportWorkflow = {
      createPlanFromFile: vi.fn(async (file: string) => {
        if (file.includes('corrupted')) {
          throw new Error('Corrupted m3u header');
        }
        return {
          playlistName: 'good_list',
          statistics: {
            totalEntries: 1,
            importedEntries: 1,
            skippedEntries: 0,
            missingEntries: 0,
            notInLibraryEntries: 0,
            invalidEntries: 0,
            warningCount: 0,
            plannedImportPercentage: 100
          },
          warnings: [],
          entries: [{ filePath: 'song.mp3' }] as any
        };
      }),
      executePlan: vi.fn(async () => ({
        playlistId: 104,
        importedSongIds: [1],
        skippedEntriesCount: 0,
        success: true,
        durationMs: 10
      }))
    } as unknown as PlaylistImportWorkflow;

    const orchestrator = new PlaylistBatchOrchestrator(mockImportWorkflow);

    const items: BatchItem[] = [
      { id: 'item_1', action: 'IMPORT', sourceFile: 'corrupted.m3u', status: 'PENDING', dependencies: [] },
      { id: 'item_2', action: 'IMPORT', sourceFile: 'good.m3u', status: 'PENDING', dependencies: [] }
    ];
    const plan = planner.createBatchPlan(items, 'CONTINUE_ON_ERROR');

    const summary = await orchestrator.executeBatchPlan(plan);

    expect(summary.totalPlaylists).toBe(2);
    expect(summary.failedCount).toBe(1);
    expect(summary.successfulCount).toBe(1);
    expect(summary.failedDetails).toEqual([
      { file: 'corrupted.m3u', reason: 'Corrupted m3u header' }
    ]);
    expect(mockImportWorkflow.executePlan).toHaveBeenCalledTimes(1);
  });

  it('should immediately cancel remaining items when cancelSession is requested', async () => {
    const graph = new PlaylistDependencyGraph();
    const planner = new PlaylistBatchPlanner(graph);

    let orchestratorRef: PlaylistBatchOrchestrator;
    const mockImportWorkflow = {
      createPlanFromFile: vi.fn(async (file: string) => {
        if (file.includes('first')) {
          // Trigger cancellation while the first item is processing
          orchestratorRef.cancelActiveSession();
        }
        return {
          playlistName: file,
          statistics: {
            totalEntries: 1,
            importedEntries: 1,
            skippedEntries: 0,
            missingEntries: 0,
            notInLibraryEntries: 0,
            invalidEntries: 0,
            warningCount: 0,
            plannedImportPercentage: 100
          },
          warnings: [],
          entries: [{ filePath: 'song.mp3' }] as any
        };
      }),
      executePlan: vi.fn(async () => ({
        playlistId: 105,
        importedSongIds: [1],
        skippedEntriesCount: 0,
        success: true,
        durationMs: 10
      }))
    } as unknown as PlaylistImportWorkflow;

    orchestratorRef = new PlaylistBatchOrchestrator(mockImportWorkflow);

    const items: BatchItem[] = [
      { id: 'item_1', action: 'IMPORT', sourceFile: 'first.m3u', status: 'PENDING', dependencies: [] },
      { id: 'item_2', action: 'IMPORT', sourceFile: 'second.m3u', status: 'PENDING', dependencies: [] },
      { id: 'item_3', action: 'IMPORT', sourceFile: 'third.m3u', status: 'PENDING', dependencies: [] }
    ];
    const plan = planner.createBatchPlan(items, 'CONTINUE_ON_ERROR');

    const summary = await orchestratorRef.executeBatchPlan(plan);

    expect(summary.status).toBe('CANCELLED');
    expect(summary.successfulCount).toBe(1); // first completed before check
    expect(summary.skippedCount).toBe(2); // remaining 2 skipped
    expect(mockImportWorkflow.createPlanFromFile).toHaveBeenCalledTimes(1);
  });

  it('should reject starting a batch if another batch is already active', async () => {
    const mockImportWorkflow = {
      createPlanFromFile: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 100));
        return {
          playlistName: 'test',
          statistics: { totalEntries: 1 },
          entries: [{ filePath: 'song.mp3' }] as any
        };
      }),
      executePlan: vi.fn(async () => ({
        playlistId: 106,
        importedSongIds: [1],
        skippedEntriesCount: 0,
        success: true,
        durationMs: 10
      }))
    } as unknown as PlaylistImportWorkflow;

    const orchestrator = new PlaylistBatchOrchestrator(mockImportWorkflow);
    const graph = new PlaylistDependencyGraph();
    const planner = new PlaylistBatchPlanner(graph);

    const plan1 = planner.createBatchPlan(
      [{ id: 'item_1', action: 'IMPORT', sourceFile: 'a.m3u', status: 'PENDING', dependencies: [] }],
      'CONTINUE_ON_ERROR'
    );
    const plan2 = planner.createBatchPlan(
      [{ id: 'item_2', action: 'IMPORT', sourceFile: 'b.m3u', status: 'PENDING', dependencies: [] }],
      'CONTINUE_ON_ERROR'
    );

    const p1 = orchestrator.executeBatchPlan(plan1);
    await expect(orchestrator.executeBatchPlan(plan2)).rejects.toThrow(
      'A playlist batch import is already in progress'
    );
    await p1;
  });
});
