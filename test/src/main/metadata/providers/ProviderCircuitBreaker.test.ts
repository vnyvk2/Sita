import { describe, expect, it } from 'vitest';

import { MetadataEventBus } from '@main/metadata/events/MetadataEventBus';
import { ProviderCircuitBreaker } from '@main/metadata/providers/circuitbreaker/ProviderCircuitBreaker';

describe('ProviderCircuitBreaker', () => {
  it('should trip open on failure threshold, block calls, and transition to half-open after cooldown', () => {
    const eventBus = new MetadataEventBus();
    const breaker = new ProviderCircuitBreaker('musicbrainz', eventBus, {
      failureThreshold: 2,
      cooldownMs: 50
    });

    expect(breaker.isCallAllowed()).toBe(true);

    breaker.onFailure();
    expect(breaker.isCallAllowed()).toBe(true);

    breaker.onFailure(); // 2nd failure threshold reached -> Open
    expect(breaker.getState()).toBe('Open');
    expect(breaker.isCallAllowed()).toBe(false);
  });
});
