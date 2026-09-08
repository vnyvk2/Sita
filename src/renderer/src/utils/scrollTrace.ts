export interface TraceEvent {
  timestamp: number;
  type:
    | 'range_changed'
    | 'request_scheduled'
    | 'request_started'
    | 'request_resolved'
    | 'seek_enter'
    | 'seek_exit'
    | 'queue_sample'
    | 'scroll_stop';
  details?: Record<string, unknown>;
}

export interface ScrollTraceSummary {
  totalScheduled: number;
  totalResolved: number;
  maxQueueDepth: number;
  seekEnteredAt?: number;
  seekExitedAt?: number;
  seekDurationMs?: number;
  scrollStoppedAt?: number;
  targetRange?: { startIndex: number; endIndex: number };
  timeToRealRowMs?: number;
  queueDepthSamples: Array<{ time: number; depth: number }>;
}

class ScrollTraceCoordinator {
  private inFlightCount = 0;
  private maxInFlight = 0;
  private scheduledCount = 0;
  private resolvedCount = 0;
  private ringBuffer: TraceEvent[] = [];
  private readonly maxBufferSize = 500;

  private queueSamples: Array<{ time: number; depth: number }> = [];
  private sampleTimer: ReturnType<typeof setInterval> | null = null;

  private isScrolling = false;
  private seekEnteredAt: number | undefined;
  private seekExitedAt: number | undefined;
  private scrollStoppedAt: number | undefined;
  private targetRange: { startIndex: number; endIndex: number } | undefined;
  private targetResolvedAt: number | undefined;

  public getInFlightCount(): number {
    return this.inFlightCount;
  }

  private pushEvent(event: TraceEvent): void {
    if (this.ringBuffer.length >= this.maxBufferSize) {
      this.ringBuffer.shift();
    }
    this.ringBuffer.push(event);
  }

  public startScrollSession(): void {
    if (!this.isScrolling) {
      this.isScrolling = true;
      this.maxInFlight = this.inFlightCount;
      this.queueSamples = [{ time: performance.now(), depth: this.inFlightCount }];

      if (!this.sampleTimer) {
        this.sampleTimer = setInterval(() => {
          const depth = this.inFlightCount;
          if (depth > this.maxInFlight) this.maxInFlight = depth;
          this.queueSamples.push({ time: performance.now(), depth });
        }, 100);
      }
    }
  }

  public onRangeChanged(range: { startIndex: number; endIndex: number }): void {
    this.startScrollSession();
    this.targetRange = range;
    this.pushEvent({
      timestamp: performance.now(),
      type: 'range_changed',
      details: { start: range.startIndex, end: range.endIndex }
    });
  }

  public onRequestScheduled(windowStart: number, isPrefetch = false): void {
    this.scheduledCount++;
    this.pushEvent({
      timestamp: performance.now(),
      type: 'request_scheduled',
      details: { windowStart, isPrefetch, totalScheduled: this.scheduledCount }
    });
  }

  public onRequestStarted(windowStart: number): void {
    this.inFlightCount++;
    if (this.inFlightCount > this.maxInFlight) {
      this.maxInFlight = this.inFlightCount;
    }
    this.pushEvent({
      timestamp: performance.now(),
      type: 'request_started',
      details: { windowStart, inFlight: this.inFlightCount }
    });
  }

  public onRequestResolved(windowStart: number, durationMs: number, rowCount: number): void {
    this.inFlightCount = Math.max(0, this.inFlightCount - 1);
    this.resolvedCount++;
    const now = performance.now();

    // Check if this window covers the target range at scroll stop
    if (
      this.scrollStoppedAt !== undefined &&
      this.targetRange !== undefined &&
      this.targetResolvedAt === undefined
    ) {
      if (
        windowStart <= this.targetRange.startIndex &&
        windowStart + 200 >= this.targetRange.endIndex
      ) {
        this.targetResolvedAt = now;
      }
    }

    this.pushEvent({
      timestamp: now,
      type: 'request_resolved',
      details: {
        windowStart,
        durationMs: Number(durationMs.toFixed(1)),
        rowCount,
        inFlight: this.inFlightCount
      }
    });
  }

  public onSeek(mode: 'enter' | 'exit', velocity: number): void {
    const now = performance.now();
    if (mode === 'enter') {
      this.seekEnteredAt = now;
    } else {
      this.seekExitedAt = now;
    }
    this.pushEvent({
      timestamp: now,
      type: mode === 'enter' ? 'seek_enter' : 'seek_exit',
      details: { velocity: Math.round(velocity) }
    });
  }

  public onScrollStop(currentRange?: { startIndex: number; endIndex: number }): void {
    const now = performance.now();
    this.isScrolling = false;
    this.scrollStoppedAt = now;
    if (currentRange) {
      this.targetRange = currentRange;
    }

    if (this.sampleTimer) {
      clearInterval(this.sampleTimer);
      this.sampleTimer = null;
    }

    this.pushEvent({
      timestamp: now,
      type: 'scroll_stop',
      details: { targetRange: this.targetRange }
    });

    // Schedule summary dump after short grace period for in-flight requests to complete
    setTimeout(() => {
      this.dumpSummary();
    }, 400);
  }

  public getSummary(): ScrollTraceSummary {
    const seekDurationMs =
      this.seekEnteredAt && this.seekExitedAt
        ? Number((this.seekExitedAt - this.seekEnteredAt).toFixed(1))
        : undefined;

    const timeToRealRowMs =
      this.scrollStoppedAt && this.targetResolvedAt
        ? Number((this.targetResolvedAt - this.scrollStoppedAt).toFixed(1))
        : undefined;

    return {
      totalScheduled: this.scheduledCount,
      totalResolved: this.resolvedCount,
      maxQueueDepth: this.maxInFlight,
      seekEnteredAt: this.seekEnteredAt,
      seekExitedAt: this.seekExitedAt,
      seekDurationMs,
      scrollStoppedAt: this.scrollStoppedAt,
      targetRange: this.targetRange,
      timeToRealRowMs,
      queueDepthSamples: [...this.queueSamples]
    };
  }

  public dumpSummary(): void {
    const summary = this.getSummary();
    // Only dump if a meaningful scroll event occurred
    if (summary.totalScheduled > 0 || summary.seekDurationMs !== undefined) {
      console.log(
        `%c[SCROLL TRACE SUMMARY]%c\n` +
          `  Max Queue Depth (In-Flight): ${summary.maxQueueDepth}\n` +
          `  Requests Scheduled / Resolved: ${summary.totalScheduled} / ${summary.totalResolved}\n` +
          `  Seek Duration (Placeholder Active): ${summary.seekDurationMs ?? 'N/A'}ms\n` +
          `  Time-to-Real-Row Post Stop: ${summary.timeToRealRowMs !== undefined ? `${summary.timeToRealRowMs}ms` : 'Immediate or Still Waiting'}\n` +
          `  Queue Depth Timeline: ${summary.queueDepthSamples.map((s) => s.depth).join(' -> ')}`,
        'color: #00ff88; font-weight: bold;',
        'color: inherit;'
      );

      (window as unknown as { __LATEST_SCROLL_TRACE__: ScrollTraceSummary }).__LATEST_SCROLL_TRACE__ =
        summary;
    }
  }

  public reset(): void {
    this.inFlightCount = 0;
    this.maxInFlight = 0;
    this.scheduledCount = 0;
    this.resolvedCount = 0;
    this.ringBuffer = [];
    this.queueSamples = [];
    this.seekEnteredAt = undefined;
    this.seekExitedAt = undefined;
    this.scrollStoppedAt = undefined;
    this.targetRange = undefined;
    this.targetResolvedAt = undefined;
    if (this.sampleTimer) {
      clearInterval(this.sampleTimer);
      this.sampleTimer = null;
    }
  }
}

export const scrollTrace = new ScrollTraceCoordinator();

if (typeof window !== 'undefined') {
  (window as unknown as { __SCROLL_TRACE__: ScrollTraceCoordinator }).__SCROLL_TRACE__ = scrollTrace;
}
