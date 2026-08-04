import type { MetadataCapability } from '../common/types';
import type { IMetadataProvider } from '../interfaces/IMetadataProvider';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { ProviderExecutionContext } from '../models/ProviderExecutionContext';
import type { UserMetadataRepository } from '../repository/UserMetadataRepository';

import { MetadataConfidence } from '../models/MetadataConfidence';
import { MetadataProviderInfo } from '../models/MetadataProviderInfo';
import { ProviderBatchResult } from '../models/ProviderBatchResult';
import { ProviderResult } from '../models/ProviderResult';

export class UserMetadataProvider implements IMetadataProvider {
  public readonly info: MetadataProviderInfo;
  private readonly repository: UserMetadataRepository;

  constructor(repository: UserMetadataRepository) {
    this.repository = repository;
    this.info = new MetadataProviderInfo({
      id: 'user-metadata-provider',
      displayName: 'User Metadata Provider',
      version: '1.0.0',
      priority: 1000
    });
    this.info.setReady();
  }

  public async initialize(): Promise<void> {
    this.info.setReady();
  }

  public supports(capability: MetadataCapability): boolean {
    return capability === 'ReadDatabase' || capability === 'ReadMemory';
  }

  public getCapabilities(): Set<MetadataCapability> {
    return new Set(['ReadDatabase', 'ReadMemory']);
  }

  public async fetch<TDTO = unknown>(
    identity: MetadataIdentity,
    _context?: ProviderExecutionContext
  ): Promise<ProviderResult<TDTO>> {
    const startMs = Date.now();
    try {
      const overrides = await this.repository.getOverrides(identity);
      const payload: Record<string, unknown> = {};

      for (const override of overrides) {
        payload[override.fieldId] = override.value;
      }

      return new ProviderResult<TDTO>({
        payload: payload as TDTO,
        confidence: MetadataConfidence.verified(),
        providerInfo: this.info,
        latencyMs: Date.now() - startMs,
        status: 'success'
      });
    } catch (error) {
      return new ProviderResult<TDTO>({
        error: error instanceof Error ? error : new Error(String(error)),
        providerInfo: this.info,
        latencyMs: Date.now() - startMs,
        status: 'error'
      });
    }
  }

  public async fetchMany<TDTO = unknown>(
    identities: MetadataIdentity[],
    _context?: ProviderExecutionContext
  ): Promise<ProviderBatchResult<TDTO>> {
    const startMs = Date.now();
    const results = new Map<string, ProviderResult<TDTO>>();

    try {
      const overridesMap = await this.repository.getOverridesForMany(identities);

      for (const identity of identities) {
        const key = `${identity.entityKind}:${String(identity.entityId)}`;
        const overrides = overridesMap.get(key) ?? [];
        const payload: Record<string, unknown> = {};

        for (const override of overrides) {
          payload[override.fieldId] = override.value;
        }

        results.set(
          identity.metadataId,
          new ProviderResult<TDTO>({
            payload: payload as TDTO,
            confidence: MetadataConfidence.verified(),
            providerInfo: this.info,
            latencyMs: 0,
            status: 'success'
          })
        );
      }

      return new ProviderBatchResult<TDTO>({
        results,
        totalLatencyMs: Date.now() - startMs
      });
    } catch (error) {
      for (const identity of identities) {
        results.set(
          identity.metadataId,
          new ProviderResult<TDTO>({
            error: error instanceof Error ? error : new Error(String(error)),
            providerInfo: this.info,
            latencyMs: Date.now() - startMs,
            status: 'error'
          })
        );
      }

      return new ProviderBatchResult<TDTO>({
        results,
        totalLatencyMs: Date.now() - startMs
      });
    }
  }

  public async refresh<TDTO = unknown>(
    identity: MetadataIdentity,
    context?: ProviderExecutionContext
  ): Promise<ProviderResult<TDTO>> {
    return this.fetch<TDTO>(identity, context);
  }

  public async refreshMany<TDTO = unknown>(
    identities: MetadataIdentity[],
    context?: ProviderExecutionContext
  ): Promise<ProviderBatchResult<TDTO>> {
    return this.fetchMany<TDTO>(identities, context);
  }

  public async shutdown(): Promise<void> {
    this.info.setDisabled('Shut down');
  }
}
