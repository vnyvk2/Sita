export interface ExecutionTimelineEntry {
  id: string;
  timestamp: Date;
  correlationId: string;
  phase: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionTimeline {
  correlationId: string;
  entries: ExecutionTimelineEntry[];
}
