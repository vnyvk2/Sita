import type { ReviewValidator } from '../validator/ReviewValidator';
import type { PlanRegenerator } from './PlanRegenerator';
import type { PlaylistImportPlan } from '../../playlistImport/models/PlaylistImportPlan';
import type { ReviewSession } from '../models/ReviewSession';
import type { UserOverride } from '../models/UserOverride';

export class PlaylistReviewService {
  private sessions = new Map<string, ReviewSession>();

  constructor(
    private validator: ReviewValidator,
    private planRegenerator: PlanRegenerator
  ) {}

  createSession(originalPlan: PlaylistImportPlan): ReviewSession {
    const id = `review_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const effectivePlan = this.planRegenerator.regeneratePlan(originalPlan, []);

    const session: ReviewSession = {
      id,
      originalPlan: JSON.parse(JSON.stringify(originalPlan)),
      effectivePlan,
      userOverrides: [],
      isValid: true,
      validationErrors: []
    };

    this.sessions.set(id, session);
    return session;
  }

  getSession(id: string): ReviewSession | null {
    const session = this.sessions.get(id);
    return session ? JSON.parse(JSON.stringify(session)) : null;
  }

  applyOverride(sessionId: string, override: UserOverride): ReviewSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Review session ${sessionId} not found`);
    }

    const validation = this.validator.validateOverride(session.effectivePlan, override);
    if (!validation.isValid) {
      session.isValid = false;
      session.validationErrors.push(...validation.errors);
      return JSON.parse(JSON.stringify(session));
    }

    session.userOverrides.push(override);
    session.effectivePlan = this.planRegenerator.regeneratePlan(session.originalPlan, session.userOverrides);
    session.isValid = true;
    session.validationErrors = [];

    return JSON.parse(JSON.stringify(session));
  }
}
