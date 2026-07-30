export interface ExecutionLevel {
  level: number;
  items: string[];
  parallelizable: boolean;
  estimatedDurationMs?: number;
}
