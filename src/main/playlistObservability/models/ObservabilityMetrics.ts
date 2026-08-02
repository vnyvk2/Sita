export interface ObservabilityMetrics {
  totalEventsProcessed: number;
  totalImportsCount: number;
  totalSyncsCount: number;
  successfulOperationsCount: number;
  failedOperationsCount: number;
  averageConfidenceScore: number;
  manualReviewRate: number;
}
