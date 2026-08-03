import { describe, expect, it } from 'vitest';

import { MetadataEventBus } from '@main/metadata/events/MetadataEventBus';
import { MetadataIdentity } from '@main/metadata/models/MetadataIdentity';
import { MetadataKinds } from '@main/metadata/models/MetadataKind';
import { MetadataProviderInfo } from '@main/metadata/models/MetadataProviderInfo';
import { ProviderHealthManager } from '@main/metadata/providers/health/ProviderHealthManager';

describe('ProviderHealthManager', () => {
  it('should calculate health metrics and track request timestamps', () => {
    const eventBus = new MetadataEventBus();
    const manager = new ProviderHealthManager(eventBus);
    const providerInfo = new MetadataProviderInfo({ id: 'musicbrainz', displayName: 'MusicBrainz', version: '1.0' });
    const identity = new MetadataIdentity({ entityKind: MetadataKinds.Song, entityId: 10 });

    eventBus.emit('ProviderStarted', { providerInfo, identity, latencyMs: 0 });
    eventBus.emit('ProviderCompleted', { providerInfo, identity, status: 'success', latencyMs: 150 });

    const health = manager.getHealth('musicbrainz');
    expect(health).toBeDefined();
    expect(health?.availabilityPercent).toBe(100);
    expect(health?.meanLatencyMs).toBe(150);
    expect(health?.p95LatencyMs).toBe(150);
    expect(health?.lastSeenAt).toBeDefined();
    expect(health?.lastSuccessfulRequestAt).toBeDefined();
  });

  it('should emit ProviderDegraded when consecutive failures exceed threshold', () => {
    const eventBus = new MetadataEventBus();
    const manager = new ProviderHealthManager(eventBus);
    const providerInfo = new MetadataProviderInfo({ id: 'spotify', displayName: 'Spotify', version: '1.0' });
    const identity = new MetadataIdentity({ entityKind: MetadataKinds.Song, entityId: 20 });

    let degradedFired = false;
    eventBus.on('ProviderDegraded', (event) => {
      degradedFired = true;
      expect(event.providerId).toBe('spotify');
    });

    for (let i = 0; i < 3; i++) {
      eventBus.emit('ProviderStarted', { providerInfo, identity, latencyMs: 0 });
      eventBus.emit('ProviderFailed', { providerInfo, identity, status: 'failed', latencyMs: 50, error: 'Network error' });
    }

    expect(degradedFired).toBe(true);
    const health = manager.getHealth('spotify');
    expect(health?.isDegraded).toBe(true);
    expect(health?.lastFailedRequestAt).toBeDefined();
  });
});
