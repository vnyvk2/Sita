import { describe, expect, it, vi } from 'vitest';

import { MetadataCapability } from '@main/metadata/common/types';
import { MetadataMergeEngine } from '@main/metadata/engine/MetadataMergeEngine';
import type { IMetadataProvider } from '@main/metadata/interfaces/IMetadataProvider';
import { MetadataConfidence } from '@main/metadata/models/MetadataConfidence';
import { MetadataIdentity } from '@main/metadata/models/MetadataIdentity';
import { MetadataProviderInfo } from '@main/metadata/models/MetadataProviderInfo';
import { ProviderResult } from '@main/metadata/models/ProviderResult';
import { DefaultMetadataMergePolicy } from '@main/metadata/providers/policies/DefaultMetadataMergePolicy';
import { DefaultProviderExecutionStrategy } from '@main/metadata/providers/strategies/DefaultProviderExecutionStrategy';
import { DefaultProviderSelectionStrategy } from '@main/metadata/providers/strategies/DefaultProviderSelectionStrategy';
import { MetadataProviderRegistry } from '@main/metadata/registries/MetadataProviderRegistry';

describe('MetadataEnrichment Integration', () => {
  it('should resolve conflicts and merge fields based on provider priority', async () => {
    const registry = new MetadataProviderRegistry();

    // 1. Define Embedded Provider (priority 100)
    const embeddedInfo = new MetadataProviderInfo({
      id: 'embedded-mock',
      displayName: 'Embedded Provider Mock',
      version: '1.0.0',
      priority: 100
    });
    embeddedInfo.setReady();

    const mockEmbeddedProvider: IMetadataProvider = {
      info: embeddedInfo,
      initialize: vi.fn(),
      supports: (cap) => cap === 'ReadDatabase',
      getCapabilities: () => new Set(['ReadDatabase']),
      fetch: vi.fn().mockResolvedValue(
        new ProviderResult({
          payload: { title: 'Local Song Title', bpm: 120, year: 2020 },
          confidence: MetadataConfidence.verified(),
          providerInfo: embeddedInfo,
          latencyMs: 1,
          status: 'success'
        })
      ),
      fetchMany: vi.fn(),
      refresh: vi.fn(),
      refreshMany: vi.fn(),
      shutdown: vi.fn()
    };

    // 2. Define User Override Provider (priority 1000)
    const userInfo = new MetadataProviderInfo({
      id: 'user-mock',
      displayName: 'User Provider Mock',
      version: '1.0.0',
      priority: 1000
    });
    userInfo.setReady();

    const mockUserProvider: IMetadataProvider = {
      info: userInfo,
      initialize: vi.fn(),
      supports: (cap) => cap === 'ReadDatabase',
      getCapabilities: () => new Set(['ReadDatabase']),
      fetch: vi.fn().mockResolvedValue(
        new ProviderResult({
          payload: { title: 'User Edited Title', comment: 'Loved it!' },
          confidence: MetadataConfidence.verified(),
          providerInfo: userInfo,
          latencyMs: 2,
          status: 'success'
        })
      ),
      fetchMany: vi.fn(),
      refresh: vi.fn(),
      refreshMany: vi.fn(),
      shutdown: vi.fn()
    };

    registry.register(mockEmbeddedProvider);
    registry.register(mockUserProvider);

    const selectionStrategy = new DefaultProviderSelectionStrategy();
    const executionStrategy = new DefaultProviderExecutionStrategy({ emit: vi.fn() } as any);
    const mergePolicy = new DefaultMetadataMergePolicy();

    const mergeEngine = new MetadataMergeEngine({
      registry,
      mergePolicy,
      selectionStrategy,
      executionStrategy
    });

    const identity = new MetadataIdentity({ entityKind: 'song', entityId: 1 });

    const merged = await mergeEngine.mergeEntity<any>(identity, 'ReadDatabase');

    expect(merged).toBeDefined();
    // Overlapping field (title) must be overridden by higher priority provider (user)
    expect(merged.title).toBe('User Edited Title');
    // Non-overlapping field from embedded must remain
    expect(merged.bpm).toBe(120);
    expect(merged.year).toBe(2020);
    // Non-overlapping field from user must be merged in
    expect(merged.comment).toBe('Loved it!');

    // Ensure mock providers were executed independently and did not cross-call each other
    expect(mockEmbeddedProvider.fetch).toHaveBeenCalledTimes(1);
    expect(mockUserProvider.fetch).toHaveBeenCalledTimes(1);
  });
});
