import type { DiagnosticIssue } from './DiagnosticIssue';
import type { ObservabilityMetrics } from './ObservabilityMetrics';
import type { OperationalRecommendation } from './OperationalRecommendation';
import type { PlaylistHealth } from './PlaylistHealth';

export interface ObservabilitySnapshot {
  timestamp: Date;
  health: PlaylistHealth;
  metrics: ObservabilityMetrics;
  diagnostics: DiagnosticIssue[];
  recommendations: OperationalRecommendation[];
}
