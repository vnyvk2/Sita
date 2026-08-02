import type { RepairCandidate } from './RepairCandidate';

export interface RepairResult {
  repaired: boolean;
  candidate?: RepairCandidate;
  allCandidates?: RepairCandidate[];
  diagnostics?: string[];
}
