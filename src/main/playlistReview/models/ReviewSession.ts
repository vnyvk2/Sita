import type { PlaylistImportPlan } from '../../playlistImport/models/PlaylistImportPlan';
import type { UserOverride } from './UserOverride';

export interface ReviewSession {
  id: string;
  originalPlan: PlaylistImportPlan;
  effectivePlan: PlaylistImportPlan;
  userOverrides: UserOverride[];
  isValid: boolean;
  validationErrors: string[];
}
