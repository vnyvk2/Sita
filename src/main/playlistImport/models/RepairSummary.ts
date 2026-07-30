export interface RepairSummary {
  repairedCount: number;
  exactMatches: number;
  repairedMatches: number;
  highestConfidence: number;
  lowestConfidence: number;
  strategiesUsed: string[];
}
