import { describe, it, expect, vi } from 'vitest';
import { PlaylistDependencyGraph } from '@main/playlistBatch/planner/PlaylistDependencyGraph';
import { PlaylistBatchPlanner } from '@main/playlistBatch/planner/PlaylistBatchPlanner';
import { PlaylistBatchOrchestrator } from '@main/playlistBatch/orchestrator/PlaylistBatchOrchestrator';
import type { BatchItem } from '@main/playlistBatch/models/BatchItem';
import type { PlaylistImportWorkflow } from '@main/playlistImport/workflow/PlaylistImportWorkflow';

describe('Phase 14 — Batch Operations & Multi-Playlist Orchestration Refinements', () => {
  it('should compute structured ExecutionLevel metadata for parallel dependency execution', () => {
    const graph = new PlaylistDependencyGraph();

    const items: BatchItem[] = [
      { id: 'item_gym', action: 'IMPORT', sourceFile: 'gym.m3u', status: 'PENDING', dependencies: ['item_workout'] },
      { id: 'item_workout', action: 'IMPORT', sourceFile: 'workout.m3u', status: 'PENDING', dependencies: ['item_rock'] },
      { id: 'item_rock', action: 'IMPORT', sourceFile: 'rock.m3u', status: 'PENDING', dependencies: [] },
      { id: 'item_pop', action: 'IMPORT', sourceFile: 'pop.m3u', status: 'PENDING', dependencies: [] }
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
        statistics: { totalEntries: 2, importedEntries: 2, skippedEntries: 0, missingEntries: 0, notInLibraryEntries: 0, invalidEntries: 0, warningCount: 0, plannedImportPercentage: 100 },
        warnings: [],
        entries: []
      })),
      executePlan: vi.fn(async () => ({ playlistId: 101, importedSongIds: [1, 2], skippedEntriesCount: 0, success: true, durationMs: 15 }))
    } as unknown as PlaylistImportWorkflow;

    const orchestrator = new PlaylistBatchOrchestrator(mockImportWorkflow);

    const items: BatchItem[] = [
      { id: 'item_1', action: 'IMPORT', sourceFile: 'rock.m3u', status: 'PENDING', dependencies: [] },
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
});
