import type { PlaylistImportHistoryRepository } from '../interfaces/PlaylistImportHistoryRepository';
import type { SessionIdGenerator } from '../interfaces/SessionIdGenerator';
import { DefaultSessionIdGenerator } from '../interfaces/SessionIdGenerator';
import type { RepairSummaryBuilder } from './RepairSummaryBuilder';
import type { PlaylistImportPlan } from '../models/PlaylistImportPlan';
import type { PlaylistImportExecutionResult } from '../models/PlaylistImportExecutionResult';
import type { PlaylistImportSession } from '../models/PlaylistImportSession';

export class PlaylistImportSessionService {
  private idGenerator: SessionIdGenerator;

  constructor(
    private repository: PlaylistImportHistoryRepository,
    private summaryBuilder: RepairSummaryBuilder,
    idGenerator?: SessionIdGenerator
  ) {
    this.idGenerator = idGenerator ?? new DefaultSessionIdGenerator();
  }

  async startSession(plan: PlaylistImportPlan): Promise<PlaylistImportSession> {
    const id = this.idGenerator.generateId();
    const repairSummary = this.summaryBuilder.buildSummary(plan);

    const session: PlaylistImportSession = {
      id,
      sourceFile: plan.sourceFile ?? plan.playlistName,
      playlistName: plan.playlistName,
      startedAt: new Date(),
      status: 'IN_PROGRESS',
      statistics: plan.statistics,
      warnings: plan.warnings,
      repairSummary
    };

    await this.repository.saveSession(session);
    return session;
  }

  async completeSession(sessionId: string, executionResult: PlaylistImportExecutionResult): Promise<void> {
    const session = await this.repository.getSession(sessionId);
    if (session) {
      await this.repository.updateSession({
        ...session,
        status: 'COMPLETED',
        completedAt: new Date(),
        execution: executionResult
      });
    }
  }

  async failSession(sessionId: string): Promise<void> {
    const session = await this.repository.getSession(sessionId);
    if (session) {
      await this.repository.updateSession({
        ...session,
        status: 'FAILED',
        completedAt: new Date()
      });
    }
  }
}
