import { MetadataEventBus } from '@main/metadata/events/MetadataEventBus';
import { MetadataIdentity } from '@main/metadata/models/MetadataIdentity';
import { MetadataKinds } from '@main/metadata/models/MetadataKind';
import { MetadataProviderInfo } from '@main/metadata/models/MetadataProviderInfo';
import { ProviderDiagnosticsTracker } from '@main/metadata/providers/ProviderDiagnosticsTracker';
import { describe, expect, it } from 'vitest';

describe('ProviderDiagnosticsTracker', () => {
  it('should track metrics by observing event bus events', () => {
    const eventBus = new MetadataEventBus();
    const tracker = new ProviderDiagnosticsTracker(eventBus);
    const providerInfo = new MetadataProviderInfo({
      id: 'spotify',
      displayName: 'Spotify',
      version: '1.0'
    });
    const identity = new MetadataIdentity({ entityKind: MetadataKinds.Song, entityId: 1 });

    eventBus.emit('ProviderStarted', { providerInfo, identity, status: 'success', latencyMs: 0 });
    eventBus.emit('ProviderCompleted', {
      providerInfo,
      identity,
      status: 'success',
      latencyMs: 120
    });

    const metrics = tracker.getMetrics('spotify');
    expect(metrics).toBeDefined();
    expect(metrics?.requestCount).toBe(1);
    expect(metrics?.successCount).toBe(1);
    expect(metrics?.lastLatencyMs).toBe(120);
    expect(metrics?.consecutiveFailures).toBe(0);
  });
});
