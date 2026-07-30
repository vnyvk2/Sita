import type { ExecutionTimeline, ExecutionTimelineEntry } from '../models/ExecutionTimeline';

export class TimelineBuilder {
  private timelines = new Map<string, ExecutionTimelineEntry[]>();

  recordEntry(entry: ExecutionTimelineEntry): void {
    const list = this.timelines.get(entry.correlationId) ?? [];
    list.push(entry);
    this.timelines.set(entry.correlationId, list);
  }

  getTimeline(correlationId: string): ExecutionTimeline | null {
    const entries = this.timelines.get(correlationId);
    if (!entries) return null;
    return {
      correlationId,
      entries: [...entries].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    };
  }
}
