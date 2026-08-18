import { describe, expect, it, vi } from 'vitest';
import { MetadataCapabilities } from '@main/metadata/common/types';
import { MetadataConfidence } from '@main/metadata/models/MetadataConfidence';
import { MetadataEventBus } from '@main/metadata/events/MetadataEventBus';
import { MetadataIdentity } from '@main/metadata/models/MetadataIdentity';
import { MetadataKinds } from '@main/metadata/models/MetadataKind';
import { MetadataProviderInfo } from '@main/metadata/models/MetadataProviderInfo';
import { ProviderExecutionContext } from '@main/metadata/models/ProviderExecutionContext';
import { ProviderResult } from '@main/metadata/models/ProviderResult';
import { MetadataProviderExecutor } from '@main/metadata/providers/MetadataProviderExecutor';
import { MetadataProviderRegistry } from '@main/metadata/registries/MetadataProviderRegistry';
import { ProviderCircuitBreaker } from '@main/metadata/providers/circuitbreaker/ProviderCircuitBreaker';
import type { IMetadataProvider } from '@main/metadata/interfaces/IMetadataProvider';

describe('AutoTag Provider Runtime Subsystem (Phase 2 Integration Gate)', () => {
  it('executes providers strictly in descending priority order and respects capability filtering', async () => {
    const eventBus = new MetadataEventBus();
    const registry = new MetadataProviderRegistry();
    const executionLog: string[] = [];

    const pLow: IMetadataProvider = {
      info: new MetadataProviderInfo({ id: 'prov-low', displayName: 'Low Priority Provider', priority: 20 }),
      initialize: async () => { pLow.info.setReady(); },
      supports: (c) => c === MetadataCapabilities.Tags,
      getCapabilities: () => new Set([MetadataCapabilities.Tags]),
      fetch: async () => {
        executionLog.push('prov-low');
        return new ProviderResult({
          payload: { title: 'Low Result' },
          confidence: MetadataConfidence.low(),
          providerInfo: pLow.info,
          latencyMs: 1,
          status: 'success'
        });
      },
      fetchMany: async () => []
    };

    const pHigh: IMetadataProvider = {
      info: new MetadataProviderInfo({ id: 'prov-high', displayName: 'High Priority Provider', priority: 90 }),
      initialize: async () => { pHigh.info.setReady(); },
      supports: (c) => c === MetadataCapabilities.Tags,
      getCapabilities: () => new Set([MetadataCapabilities.Tags]),
      fetch: async () => {
        executionLog.push('prov-high');
        return new ProviderResult({
          payload: { title: 'High Result' },
          confidence: MetadataConfidence.default(),
          providerInfo: pHigh.info,
          latencyMs: 1,
          status: 'success'
        });
      },
      fetchMany: async () => []
    };

    await pLow.initialize();
    await pHigh.initialize();

    // Register in reverse priority order
    registry.register(pLow);
    registry.register(pHigh);

    const executor = new MetadataProviderExecutor({ registry, eventBus });
    const identity = new MetadataIdentity({ entityKind: MetadataKinds.Song, entityId: 10 });

    const results = await executor.execute(identity, MetadataCapabilities.Tags);

    expect(results).toHaveLength(2);
    expect(executionLog).toEqual(['prov-high', 'prov-low']);
    expect(results[0].providerInfo.id).toBe('prov-high');
    expect(results[1].providerInfo.id).toBe('prov-low');
  });

  it('guarantees that user cancellation immediately skips subsequent providers and does not poison circuit breakers', async () => {
    const eventBus = new MetadataEventBus();
    const registry = new MetadataProviderRegistry();
    const token = { isCancelled: false };
    const executedProviders: string[] = [];

    const breakerA = new ProviderCircuitBreaker('prov-abort-a', eventBus, { failureThreshold: 3 });

    const pA: IMetadataProvider = {
      info: new MetadataProviderInfo({ id: 'prov-abort-a', displayName: 'Provider A', priority: 100 }),
      initialize: async () => { pA.info.setReady(); },
      supports: (c) => c === MetadataCapabilities.Tags,
      getCapabilities: () => new Set([MetadataCapabilities.Tags]),
      fetch: async () => {
        executedProviders.push('prov-abort-a');
        // User aborts during provider A execution
        token.isCancelled = true;
        const abortErr = new Error('The operation was aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      },
      fetchMany: async () => []
    };

    const pB: IMetadataProvider = {
      info: new MetadataProviderInfo({ id: 'prov-abort-b', displayName: 'Provider B', priority: 50 }),
      initialize: async () => { pB.info.setReady(); },
      supports: (c) => c === MetadataCapabilities.Tags,
      getCapabilities: () => new Set([MetadataCapabilities.Tags]),
      fetch: async () => {
        executedProviders.push('prov-abort-b');
        return new ProviderResult({
          payload: null,
          confidence: MetadataConfidence.low(),
          providerInfo: pB.info,
          latencyMs: 1,
          status: 'success'
        });
      },
      fetchMany: async () => []
    };

    await pA.initialize();
    await pB.initialize();

    registry.register(pA);
    registry.register(pB);

    const executor = new MetadataProviderExecutor({ registry, eventBus });
    const execContext = new ProviderExecutionContext({ cancellationToken: token });
    const identity = new MetadataIdentity({ entityKind: MetadataKinds.Song, entityId: 20 });

    const results = await executor.execute(identity, MetadataCapabilities.Tags, execContext);

    // Provider B must NEVER be executed because Provider A was aborted
    expect(executedProviders).toEqual(['prov-abort-a']);
    expect(results).toHaveLength(2);
    expect(results[1].status).toBe('skipped');

    // Invariant: Cancellation must NOT increment breaker failure count
    expect(breakerA.getFailureCount()).toBe(0);
    expect(breakerA.getState()).toBe('Closed');
  });

  it('orchestrates complete circuit breaker lifecycle with HalfOpen probe throttling and recovery', () => {
    vi.useFakeTimers();
    try {
      const eventBus = new MetadataEventBus();
      const breaker = new ProviderCircuitBreaker('prov-mb', eventBus, {
        failureThreshold: 3,
        cooldownMs: 10000,
        successThreshold: 2
      });

      // 1. Trigger 3 failures -> trips Open
      breaker.onFailure('HTTP 503');
      breaker.onFailure('HTTP 503');
      breaker.onFailure('HTTP 503');
      expect(breaker.getState()).toBe('Open');
      expect(breaker.isCallAllowed()).toBe(false);

      // 2. Advance time to half-open
      vi.advanceTimersByTime(10001);
      expect(breaker.getState()).toBe('HalfOpen');
      expect(breaker.isCallAllowed()).toBe(true);

      // 3. First probe enters -> throttling active
      breaker.recordProbeStart();
      expect(breaker.isCallAllowed()).toBe(false);

      // 4. First probe succeeds -> remains HalfOpen, permits next probe
      breaker.onSuccess();
      expect(breaker.getState()).toBe('HalfOpen');
      expect(breaker.isCallAllowed()).toBe(true);

      // 5. Second probe enters and succeeds -> transitions to Closed
      breaker.recordProbeStart();
      breaker.onSuccess();
      expect(breaker.getState()).toBe('Closed');
      expect(breaker.isCallAllowed()).toBe(true);
      expect(breaker.getFailureCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
