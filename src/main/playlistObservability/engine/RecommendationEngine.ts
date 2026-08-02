import type { DiagnosticIssue } from '../models/DiagnosticIssue';
import type { OperationalRecommendation } from '../models/OperationalRecommendation';

export class RecommendationEngine {
  generateRecommendations(issues: DiagnosticIssue[]): OperationalRecommendation[] {
    const recommendations: OperationalRecommendation[] = [];

    for (const issue of issues) {
      if (issue.code === 'LOW_MATCH_CONFIDENCE') {
        recommendations.push({
          id: `rec_${Date.now()}_1`,
          title: 'Rescan Music Library Metadata',
          description: 'Repaired tracks have lower than expected confidence match scores.',
          actionable: 'Run full library metadata rescan to improve exact path resolution.',
          priority: 'HIGH'
        });
      }

      if (issue.code === 'FREQUENT_MANUAL_REVIEW') {
        recommendations.push({
          id: `rec_${Date.now()}_2`,
          title: 'Update Automation Rules',
          description: 'A high percentage of imports require manual review intervention.',
          actionable: 'Adjust rule confidence thresholds or add candidate selection predicates.',
          priority: 'MEDIUM'
        });
      }

      if (issue.code === 'HIGH_FAILURE_RATE') {
        recommendations.push({
          id: `rec_${Date.now()}_3`,
          title: 'Check Storage & File Permissions',
          description: 'Multiple operations failed during execution.',
          actionable: 'Verify local playlist file read/write permissions and path validity.',
          priority: 'HIGH'
        });
      }
    }

    if (recommendations.length === 0) {
      recommendations.push({
        id: `rec_${Date.now()}_default`,
        title: 'System Operating Normally',
        description: 'No operational bottlenecks or issues detected.',
        actionable: 'No action required.',
        priority: 'LOW'
      });
    }

    return recommendations;
  }
}
