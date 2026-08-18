import { describe, expect, it } from 'vitest';
import { MetadataCapabilities } from '@main/metadata/common/types';
import { MetadataConfidence } from '@main/metadata/models/MetadataConfidence';
import { MetadataEventBus } from '@main/metadata/events/MetadataEventBus';
import { MetadataIdentity } from '@main/metadata/models/MetadataIdentity';
import { MetadataKinds } from '@main/metadata/models/MetadataKind';
import { MetadataProviderInfo } from '@main/metadata/models/MetadataProviderInfo';
import { ProviderExecutionContext } from '@main/metadata/models/ProviderExecutionContext';
import { ProviderResult } from '@main/metadata/models/ProviderResult';
import { CircuitBreakerStage } from '@main/metadata/providers/execution/stages/CircuitBreakerStage';
import { ProviderCircuitBreaker } from '@main/metadata/providers/circuitbreaker/ProviderCircuitBreaker';
import { ProviderExecutionStageContext } from '@main/metadata/providers/execution/ProviderExecutionStageContext';
import type { IMetadataProvider } from '@main/metadata/interfaces/IMetadataProvider';

describe('CircuitBreakerStage', () => {
  const createMockProvider = (id: string): IMetadataProvider => {
    const info = new MetadataProviderInfo({ id, displayName: id, priority: 50 });
    return {
      info,
      initialize: async () => { info.setReady(); },
      supports: () => true,
      getCapabilities: () => new Set([MetadataCapabilities.Tags]),
      fetch: async () => new ProviderResult({
        payload: null,
        confidence: MetadataConfidence.default(),
        providerInfo: info,
        latencyMs: 1,
        status: 'success'
      }),
      fetchMany: async () => []
    };
  };

  it('does NOT record failure when next() throws AbortError (preserves Closed breaker)', async () => {
    const stage = new CircuitBreakerStage();
    const eventBus = new MetadataEventBus();
    const provider = createMockProvider('prov-abort-test');
    const identity = new MetadataIdentity({ entityKind: MetadataKinds.Song, entityId: 1 });

    const context = new ProviderExecutionStageContext({
      provider,
      identity,
      eventBus,
      action: async () => provider.fetch(identity)
    });

    const breaker = stage.getCircuitBreaker(provider.info.id, context as unknown as ProviderExecutionStageContext);

    await expect(
      stage.execute(context, async () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      })
    ).rejects.toThrow('The operation was aborted');

    expect(breaker.getFailureCount()).toBe(0);
    expect(breaker.getState()).toBe('Closed');
  });

  it('does NOT record failure when cancellationToken.isCancelled is true with generic error', async () => {
    const stage = new CircuitBreakerStage();
    const eventBus = new MetadataEventBus();
    const provider = createMockProvider('prov-token-cancel-test');
    const identity = new MetadataIdentity({ entityKind: MetadataKinds.Song, entityId: 2 });
    const execContext = new ProviderExecutionContext({ cancellationToken: { isCancelled: true } });

    const context = new ProviderExecutionStageContext({
      provider,
      identity,
      execContext,
      eventBus,
      action: async () => provider.fetch(identity)
    });

    const breaker = stage.getCircuitBreaker(provider.info.id, context as unknown as ProviderExecutionStageContext);

    await expect(
      stage.execute(context, async () => {
        throw new Error('Socket closed due to user abort');
      })
    ).rejects.toThrow('Socket closed due to user abort');

    expect(breaker.getFailureCount()).toBe(0);
    expect(breaker.getState()).toBe('Closed');
  });

  it('records failure and trips to Open when non-cancellation errors exceed threshold', async () => {
    const stage = new CircuitBreakerStage();
    const eventBus = new MetadataEventBus();
    const provider = createMockProvider('prov-fail-test');
    const identity = new MetadataIdentity({ entityKind: MetadataKinds.Song, entityId: 3 });

    const context = new ProviderExecutionStageContext({
      provider,
      identity,
      eventBus,
      action: async () => provider.fetch(identity)
    });

    const breaker = stage.getCircuitBreaker(provider.info.id, context as unknown as ProviderExecutionStageContext);

    // Fail 5 times to trip default failureThreshold
    for (let i = 0; i < 5; i++) {
      await expect(
        stage.execute(context, async () => {
          throw new Error(`Upstream 500 error #${i + 1}`);
        })
      ).rejects.toThrow(`Upstream 500 error #${i + 1}`);
    }

    expect(breaker.getFailureCount()).toBe(5);
    expect(breaker.getState()).toBe('Open');

    // 6th call should be short-circuited and skipped
    const skippedResult = await stage.execute(context, async () => {
      throw new Error('Should not reach here');
    });

    expect(skippedResult.status).toBe('skipped');
    expect(skippedResult.error).toContain('Circuit breaker is open');
  });
});
