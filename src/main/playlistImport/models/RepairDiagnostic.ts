export interface RepairDiagnostic {
  strategyName: string;
  confidence: number;
  reason: string;
  candidateCount?: number;
}
