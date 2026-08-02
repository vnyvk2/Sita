import type { DiagnosticIssue } from '../models/DiagnosticIssue';
import type { ObservabilityMetrics } from '../models/ObservabilityMetrics';
import type { PlaylistHealth } from '../models/PlaylistHealth';

export class HealthEvaluator {
  computeHealth(metrics: ObservabilityMetrics, issues: DiagnosticIssue[]): PlaylistHealth {
    let score = 100;

    for (const issue of issues) {
      if (issue.severity === 'CRITICAL') {
        score -= 40;
      } else if (issue.severity === 'WARNING') {
        score -= 15;
      } else {
        score -= 5;
      }
    }

    score = Math.max(0, score);

    let status: PlaylistHealth['status'] = 'HEALTHY';
    if (score < 50) {
      status = 'CRITICAL';
    } else if (score < 85) {
      status = 'WARNING';
    }

    return {
      status,
      score,
      activeIssueCount: issues.length
    };
  }
}
