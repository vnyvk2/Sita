export type HealthStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL';

export interface PlaylistHealth {
  status: HealthStatus;
  score: number;
  activeIssueCount: number;
}
