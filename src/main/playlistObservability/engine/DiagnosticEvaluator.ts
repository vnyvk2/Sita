import type { DiagnosticIssue } from '../models/DiagnosticIssue';
import type { ObservabilityMetrics } from '../models/ObservabilityMetrics';

export class DiagnosticEvaluator {
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
}
