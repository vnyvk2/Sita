import type { PlaylistImportPlan } from '../../playlistImport/models/PlaylistImportPlan';
import type { UserOverride } from './UserOverride';

export interface ReviewSession {
  id: string;
  originalPlan: PlaylistImportPlan;
  currentPlan: PlaylistImportPlan;
  userOverrides: UserOverride[];
  isValid: boolean;
  validationErrors: string[];
}
