import { describe, expect, it, vi } from 'vitest';
import type { IMetadataProviderAdapter } from '../../contracts/IMetadataProviderAdapter';
import { ProviderCapabilities, ProviderCapability } from '../../contracts/ProviderCapabilities';
import { ProviderState } from '../../contracts/ProviderStatus';
import { MetadataProviderRuntime } from '../MetadataProviderRuntime';

const mockAdapter: IMetadataProviderAdapter = {
  identity: {
    id: 'mock-provider',
    name: 'Mock Provider',
    version: '1.0.0',
    providerType: 'online'
  },
  capabilities: new ProviderCapabilities([ProviderCapability.Lookup, ProviderCapability.Artwork]),
  status: { state: ProviderState.Uninitialized, consecutiveFailures: 0 },
  legacyInfo: {
    id: 'mock-provider',
    name: 'Mock Provider',
    version: '1.0.0',
    capabilities: new Set()
  },
  initialize: vi.fn().mockResolvedValue(undefined),
  shutdown: vi.fn().mockResolvedValue(undefined),
  supports: (cap) => cap === ProviderCapability.Lookup || cap === ProviderCapability.Artwork,
  lookup: vi.fn().mockResolvedValue({ providerId: 'mock-provider', success: true }),
  search: vi.fn().mockResolvedValue([])
};

describe('Metadata Runtime — MetadataProviderRuntime & Health State', () => {
  it('initializes provider adapter and transitions state to Healthy', async () => {
    const runtime = new MetadataProviderRuntime(mockAdapter);
    expect(runtime.status.state).toBe(ProviderState.Uninitialized);

    await runtime.initialize();
    expect(runtime.status.state).toBe(ProviderState.Healthy);
    expect(runtime.isAvailable()).toBe(true);
  });

  it('records consecutive failures and transitions from Healthy to Degraded to Offline', async () => {
    const runtime = new MetadataProviderRuntime(mockAdapter, undefined, {
      failureThresholdBeforeDegraded: 2,
      failureThresholdBeforeOffline: 4
    });
    await runtime.initialize();

    runtime.recordFailure('Timeout 1');
    expect(runtime.status.state).toBe(ProviderState.Healthy);

    runtime.recordFailure('Timeout 2');
    expect(runtime.status.state).toBe(ProviderState.Degraded);
    expect(runtime.isAvailable()).toBe(true);

    runtime.recordFailure('Timeout 3');
    runtime.recordFailure('Timeout 4');
    expect(runtime.status.state).toBe(ProviderState.Offline);
    expect(runtime.isAvailable()).toBe(false);

    runtime.recordSuccess(120);
    expect(runtime.status.state).toBe(ProviderState.Healthy);
    expect(runtime.status.consecutiveFailures).toBe(0);
  });
});
