import type { PlaylistImportPlan } from '../../playlistImport/models/PlaylistImportPlan';
import type { UserOverride } from '../models/UserOverride';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export class ReviewValidator {
  validateOverride(plan: PlaylistImportPlan, override: UserOverride): ValidationResult {
    const errors: string[] = [];

    const targetEntry = plan.entries.find((e) => e.source.position === override.entryPosition);
    if (!targetEntry) {
      errors.push(`Entry position ${override.entryPosition} does not exist in playlist plan`);
      return { isValid: false, errors };
    }

    if (override.type === 'SELECT_CANDIDATE') {
      if (override.selectedSongId === undefined || override.selectedSongId <= 0) {
        errors.push(`Invalid song ID ${override.selectedSongId} specified for candidate selection`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
