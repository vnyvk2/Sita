import type { DiagnosticIssue } from '../models/DiagnosticIssue';
import type { ObservabilityMetrics } from '../models/ObservabilityMetrics';
import type { PlaylistHealth } from '../models/PlaylistHealth';

export class DiagnosticEngine {
  evaluateDiagnostics(metrics: ObservabilityMetrics): DiagnosticIssue[] {
    const issues: DiagnosticIssue[] = [];

    if (metrics.failedOperationsCount > 0 && metrics.successfulOperationsCount === 0) {
      issues.push({
        id: `diag_${Date.now()}_1`,
        code: 'HIGH_FAILURE_RATE',
        severity: 'CRITICAL',
        message: 'All recent playlist operations have failed',
        timestamp: new Date()
      });
    }

    if (metrics.manualReviewRate > 0.3) {
      issues.push({
        id: `diag_${Date.now()}_2`,
        code: 'FREQUENT_MANUAL_REVIEW',
        severity: 'WARNING',
        message: 'Manual review rate exceeds 30% of import operations',
        timestamp: new Date()
      });
    }

    if (metrics.averageConfidenceScore > 0 && metrics.averageConfidenceScore < 85) {
      issues.push({
        id: `diag_${Date.now()}_3`,
        code: 'LOW_MATCH_CONFIDENCE',
        severity: 'WARNING',
        message: 'Average repair confidence score is below 85%',
        timestamp: new Date()
      });
    }

    return issues;
  }

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
