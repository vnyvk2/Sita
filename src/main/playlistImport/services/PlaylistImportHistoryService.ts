import type { PlaylistImportHistoryRepository } from '../interfaces/PlaylistImportHistoryRepository';
import type { PlaylistUndoPersistence } from '../interfaces/PlaylistUndoPersistence';
import type { PlaylistImportExecutionResult } from '../models/PlaylistImportExecutionResult';
import type { PlaylistImportSession } from '../models/PlaylistImportSession';
import type { PlaylistImportWorkflow } from '../workflow/PlaylistImportWorkflow';

export class PlaylistImportHistoryService {
  constructor(
    private historyRepository: PlaylistImportHistoryRepository,
    private undoPersistence?: PlaylistUndoPersistence
  ) {}

  async listHistory(): Promise<PlaylistImportSession[]> {
    return await this.historyRepository.listSessions();
  }

  async getSession(sessionId: string): Promise<PlaylistImportSession | null> {
    return await this.historyRepository.getSession(sessionId);
  }

  async undoImport(
    sessionId: string,
    customUndoPersistence?: PlaylistUndoPersistence
  ): Promise<boolean> {
    const session = await this.historyRepository.getSession(sessionId);

    if (!session || session.status !== 'COMPLETED' || !session.execution) {
      return false;
    }

    const undoPersistence = customUndoPersistence ?? this.undoPersistence;
    if (!undoPersistence) {
      throw new Error('No PlaylistUndoPersistence provider available to delete imported playlist');
    }

    await undoPersistence.deletePlaylist(session.execution.playlistId);

    const updatedSession: PlaylistImportSession = {
      ...session,
      status: 'UNDONE',
      completedAt: new Date()
    };

    await this.historyRepository.updateSession(updatedSession);
    return true;
  }

  async replayImport(
    sessionId: string,
    workflow: PlaylistImportWorkflow
  ): Promise<PlaylistImportExecutionResult> {
    const session = await this.historyRepository.getSession(sessionId);

    if (!session) {
      throw new Error(`Session with ID ${sessionId} not found for replay`);
    }

    const plan = await workflow.createPlanFromFile(session.sourceFile);
    return await workflow.executePlan(plan);
  }
}
