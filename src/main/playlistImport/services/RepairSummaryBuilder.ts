import type { PlaylistImportPlan } from '../models/PlaylistImportPlan';
import type { RepairSummary } from '../models/RepairSummary';

export class RepairSummaryBuilder {
  buildSummary(plan: PlaylistImportPlan): RepairSummary {
    let exactMatches = 0;
    let repairedMatches = 0;
    let highestConfidence = 0;
    let lowestConfidence = 100;
    const strategiesUsed = new Set<string>();

    for (const entry of plan.entries) {
      const match = entry.source.trackReference.libraryMatch;
      if (match.status === 'MATCHED') {
        if (match.matchType === 'REPAIRED') {
          repairedMatches++;
          if (match.confidence > highestConfidence) highestConfidence = match.confidence;
          if (match.confidence < lowestConfidence) lowestConfidence = match.confidence;

          for (const diag of match.diagnostics ?? []) {
            if (typeof diag === 'object' && diag.strategyName) {
              strategiesUsed.add(diag.strategyName);
            }
          }
        } else {
          exactMatches++;
        }
      }
    }

    return {
      repairedCount: repairedMatches,
      exactMatches,
      repairedMatches,
      highestConfidence: repairedMatches > 0 ? highestConfidence : 0,
      lowestConfidence: repairedMatches > 0 ? lowestConfidence : 0,
      strategiesUsed: Array.from(strategiesUsed)
    };
  }
}
