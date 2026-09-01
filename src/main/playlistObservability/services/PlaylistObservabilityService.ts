import type { PlaylistEventBus } from '../../playlistAutomation/events/PlaylistEventBus';
import type { PlaylistAutomationEvent } from '../../playlistAutomation/models/PlaylistAutomationEvent';
import type { DiagnosticEvaluator } from '../engine/DiagnosticEvaluator';
import type { HealthEvaluator } from '../engine/HealthEvaluator';
import type { RecommendationEngine } from '../engine/RecommendationEngine';
import type { TimelineBuilder } from '../engine/TimelineBuilder';
import type { DiagnosticIssue } from '../models/DiagnosticIssue';
import type { ExecutionTimeline } from '../models/ExecutionTimeline';
import type { ObservabilityMetrics } from '../models/ObservabilityMetrics';
import type { ObservabilitySnapshot } from '../models/ObservabilitySnapshot';
import type { PlaylistHealth } from '../models/PlaylistHealth';

export class PlaylistObservabilityService {
  private metrics: ObservabilityMetrics = {
    totalEventsProcessed: 0,
    totalImportsCount: 0,
    totalSyncsCount: 0,
    successfulOperationsCount: 0,
    failedOperationsCount: 0,
    averageConfidenceScore: 100,
    manualReviewRate: 0
  };

  private unsubscribe?: () => void;

  constructor(
    private timelineBuilder: TimelineBuilder,
    private diagnosticEvaluator: DiagnosticEvaluator,
    private healthEvaluator: HealthEvaluator,
    private recommendationEngine: RecommendationEngine,
    eventBus?: PlaylistEventBus
  ) {
    if (eventBus) {
      this.subscribeToEvents(eventBus);
    }
  }

  subscribeToEvents(eventBus: PlaylistEventBus): void {
    this.unsubscribe = eventBus.subscribe((event) => {
      this.ingestEvent(event);
    });
  }

  ingestEvent(event: PlaylistAutomationEvent): void {
    this.metrics.totalEventsProcessed++;

    const correlationId = (event.payload?.correlationId as string) ?? `flow_${event.id}`;
    this.timelineBuilder.recordEntry({
      id: `tl_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      timestamp: event.timestamp,
      correlationId,
      phase: event.type,
      message: `Event ${event.type} emitted for item ${event.sourceFile ?? event.playlistId ?? 'system'}`,
      metadata: event.payload
    });

    if (event.type === 'PLAYLIST_CREATED') {
      this.metrics.totalImportsCount++;
      this.metrics.successfulOperationsCount++;
    } else if (event.type === 'SYNC_COMPLETED') {
      this.metrics.totalSyncsCount++;
      this.metrics.successfulOperationsCount++;
    }
  }

  getMetrics(): ObservabilityMetrics {
    return { ...this.metrics };
  }

  getTimeline(correlationId: string): ExecutionTimeline | null {
    return this.timelineBuilder.getTimeline(correlationId);
  }

  getDiagnostics(): DiagnosticIssue[] {
    return this.diagnosticEvaluator.evaluateDiagnostics(this.metrics);
  }

  getHealth(): PlaylistHealth {
    const issues = this.getDiagnostics();
    return this.healthEvaluator.computeHealth(this.metrics, issues);
  }

  getSnapshot(): ObservabilitySnapshot {
    const diagnostics = this.getDiagnostics();
    const health = this.healthEvaluator.computeHealth(this.metrics, diagnostics);
    const recommendations = this.recommendationEngine.generateRecommendations(diagnostics);

    return {
      timestamp: new Date(),
      health,
      metrics: this.getMetrics(),
      diagnostics,
      recommendations
    };
  }

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}
