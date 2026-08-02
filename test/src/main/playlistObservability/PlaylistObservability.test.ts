import { describe, it, expect } from 'vitest';
import { TimelineBuilder } from '@main/playlistObservability/engine/TimelineBuilder';
import { DiagnosticEvaluator } from '@main/playlistObservability/engine/DiagnosticEvaluator';
import { HealthEvaluator } from '@main/playlistObservability/engine/HealthEvaluator';
import { RecommendationEngine } from '@main/playlistObservability/engine/RecommendationEngine';
import { PlaylistObservabilityService } from '@main/playlistObservability/services/PlaylistObservabilityService';
import { PlaylistEventBus } from '@main/playlistAutomation/events/PlaylistEventBus';

describe('Phase 15 — Observability, Diagnostics & Operational Intelligence Refinements', () => {
  it('should passively ingest events and assemble execution timeline', () => {
    const bus = new PlaylistEventBus();
    const timelineBuilder = new TimelineBuilder();
    const diagnosticEvaluator = new DiagnosticEvaluator();
    const healthEvaluator = new HealthEvaluator();
    const recommendationEngine = new RecommendationEngine();

    const service = new PlaylistObservabilityService(
      timelineBuilder,
      diagnosticEvaluator,
      healthEvaluator,
      recommendationEngine,
      bus
    );

    bus.publish({
      id: 'evt_1',
      type: 'SOURCE_FILE_CHANGED',
      timestamp: new Date(),
      sourceFile: 'rock.m3u',
      payload: { correlationId: 'flow_999' }
    });

    bus.publish({
      id: 'evt_2',
      type: 'SYNC_COMPLETED',
      timestamp: new Date(),
      playlistId: 101,
      payload: { correlationId: 'flow_999' }
    });

    const timeline = service.getTimeline('flow_999');
    expect(timeline).not.toBeNull();
    expect(timeline?.entries).toHaveLength(2);
    expect(timeline?.entries[0].phase).toBe('SOURCE_FILE_CHANGED');
    expect(timeline?.entries[1].phase).toBe('SYNC_COMPLETED');
  });

  it('should compute health score, diagnostics, and operational recommendations via evaluators', () => {
    const timelineBuilder = new TimelineBuilder();
    const diagnosticEvaluator = new DiagnosticEvaluator();
    const healthEvaluator = new HealthEvaluator();
    const recommendationEngine = new RecommendationEngine();

    const service = new PlaylistObservabilityService(
      timelineBuilder,
      diagnosticEvaluator,
      healthEvaluator,
      recommendationEngine
    );

    service.ingestEvent({
      id: 'evt_rock',
      type: 'PLAYLIST_CREATED',
      timestamp: new Date(),
      sourceFile: 'rock.m3u'
    });

    const snapshot = service.getSnapshot();
    expect(snapshot.health.status).toBe('HEALTHY');
    expect(snapshot.health.score).toBe(100);
    expect(snapshot.recommendations.length).toBeGreaterThan(0);
  });
});
