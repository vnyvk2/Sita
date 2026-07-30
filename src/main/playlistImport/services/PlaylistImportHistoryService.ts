import type { PlaylistImportHistoryRepository } from '../interfaces/PlaylistImportHistoryRepository';
import type { PlaylistPersistence } from '../interfaces/PlaylistPersistence';
import type { PlaylistImportWorkflow } from '../workflow/PlaylistImportWorkflow';
import type { PlaylistImportSession } from '../models/PlaylistImportSession';
import type { PlaylistImportExecutionResult } from '../models/PlaylistImportExecutionResult';

export class PlaylistImportHistoryService {
  constructor(
    private historyRepository: PlaylistImportHistoryRepository,
    private persistence?: PlaylistPersistence
  ) {}

  async listHistory(): Promise<PlaylistImportSession[]> {
    return await this.historyRepository.listSessions();
  }

  async getSession(sessionId: string): Promise<PlaylistImportSession | null> {
    return await this.historyRepository.getSession(sessionId);
  }

  async undoImport(sessionId: string, customPersistence?: PlaylistPersistence): Promise<boolean> {
    const session = await this.historyRepository.getSession(sessionId);

    if (!session || session.status !== 'COMPLETED' || !session.execution) {
      return false;
    }

    const persistence = customPersistence ?? this.persistence;
    if (!persistence?.deletePlaylist) {
      throw new Error('Persistence provider does not support deletePlaylist');
    }

    await persistence.deletePlaylist(session.execution.playlistId);

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
