import type { PlaylistImportService } from '../services/PlaylistImportService';
import type { PlaylistPathResolver } from '../resolver/PlaylistPathResolver';
import type { FilesystemVerifier } from '../verifier/FilesystemVerifier';
import type { LibraryResolver } from '../resolver/LibraryResolver';
import type { PlaylistRepairEngine } from '../repair/PlaylistRepairEngine';
import type { PlaylistImportPlanner } from '../planner/PlaylistImportPlanner';
import type { PlaylistImportOptions } from '../interfaces/PlaylistImporter';
import type { PlaylistImportPlan } from '../models/PlaylistImportPlan';
import type { PlaylistImportProgress } from '../models/PlaylistImportProgress';
import type { PlaylistImportStage } from '../models/PlaylistImportStage';

export type ProgressListener = (progress: PlaylistImportProgress) => void;

export class PlaylistImportPipeline {
  constructor(
    private importService: PlaylistImportService,
    private pathResolver: PlaylistPathResolver,
    private verifier: FilesystemVerifier,
    private libraryResolver: LibraryResolver,
    private planner: PlaylistImportPlanner,
    private repairEngine?: PlaylistRepairEngine
  ) {}

  async generatePlan(
    filePath: string,
    options?: PlaylistImportOptions,
    onProgress?: ProgressListener
  ): Promise<PlaylistImportPlan> {
    try {
      this.emitProgress(onProgress, 'READING_FILE', 'Reading playlist file...', 10);

      const importResult = await this.importService.importPlaylist(filePath, options);
      this.emitProgress(onProgress, 'PARSING_PLAYLIST', 'Parsed playlist content successfully', 30);

      this.emitProgress(onProgress, 'RESOLVING_PATHS', 'Resolving track file paths...', 50);
      const resolvedPlaylist = this.pathResolver.resolvePlaylist(importResult.playlist, filePath);

      this.emitProgress(onProgress, 'VERIFYING_FILES', 'Checking track file existence on disk...', 70);
      const verifiedPlaylist = await this.verifier.verifyPlaylist(resolvedPlaylist);

      this.emitProgress(onProgress, 'MATCHING_LIBRARY', 'Matching entries against Nora library...', 85);
      let libraryResolvedPlaylist = await this.libraryResolver.resolvePlaylist(verifiedPlaylist);

      if (this.repairEngine) {
        libraryResolvedPlaylist = await this.repairEngine.repairPlaylist(libraryResolvedPlaylist);
      }

      this.emitProgress(onProgress, 'PLANNING_IMPORT', 'Generating import execution plan...', 95);
      const plan = this.planner.createPlan(libraryResolvedPlaylist, importResult.warnings);

      this.emitProgress(onProgress, 'COMPLETED', 'Import plan generated successfully', 100);
      return plan;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emitProgress(onProgress, 'FAILED', `Plan generation failed: ${errorMessage}`, 0);
      throw error;
    }
  }

  private emitProgress(
    listener: ProgressListener | undefined,
    stage: PlaylistImportStage,
    message: string,
    percentage: number
  ): void {
    if (listener) {
      listener({ stage, message, percentage });
    }
  }
}
