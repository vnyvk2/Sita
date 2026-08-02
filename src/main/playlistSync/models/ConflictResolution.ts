export interface ConflictResolution {
  conflictId: string;
  strategyName: string;
  action: string;
  applied: boolean;
}
