import type { PlaylistImportPipeline } from '../../playlistImport/pipeline/PlaylistImportPipeline';
import type { PlaylistSourceTracker } from '../services/PlaylistSourceTracker';
import type { PlaylistSyncPlanner } from '../planner/PlaylistSyncPlanner';
import type { PlaylistSyncExecutor, SyncExecutionResult } from '../executor/PlaylistSyncExecutor';
import type { PlaylistLink } from '../models/PlaylistLink';
import type { PlaylistSyncPlan } from '../models/PlaylistSyncPlan';

export class PlaylistSyncWorkflow {
  constructor(
    private tracker: PlaylistSourceTracker,
    private importPipeline: PlaylistImportPipeline,
    private syncPlanner: PlaylistSyncPlanner,
    private syncExecutor: PlaylistSyncExecutor
  ) {}

  async generateSyncPlan(
    link: PlaylistLink,
    currentPlaylistSongIds: number[]
  ): Promise<PlaylistSyncPlan | null> {
    const hasChanged = await this.tracker.hasSourceChanged(link);
    if (!hasChanged && link.fileHash) {
      return null;
    }

    const importPlan = await this.importPipeline.generatePlan(link.sourceFile);
    return this.syncPlanner.createSyncPlan(link, importPlan, currentPlaylistSongIds);
  }

  async executeSyncPlan(plan: PlaylistSyncPlan): Promise<SyncExecutionResult> {
    return await this.syncExecutor.executeSync(plan);
  }
}
