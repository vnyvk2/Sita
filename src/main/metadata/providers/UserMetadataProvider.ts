import type { MetadataCapability } from '../common/types';
import type { IMetadataProvider } from '../interfaces/IMetadataProvider';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { ProviderExecutionContext } from '../models/ProviderExecutionContext';
import type { UserMetadataRepository } from '../repository/UserMetadataRepository';

import { MetadataCapabilities } from '../common/types';
import { MetadataConfidence } from '../models/MetadataConfidence';
import { MetadataProviderInfo } from '../models/MetadataProviderInfo';
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
    return capability === MetadataCapabilities.Tags;
  }

  public getCapabilities(): Set<MetadataCapability> {
    return new Set([MetadataCapabilities.Tags]);
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
        payload: null,
        confidence: MetadataConfidence.low(),
        error: error instanceof Error ? error.message : String(error),
        providerInfo: this.info,
        latencyMs: Date.now() - startMs,
        status: 'failed'
      });
    }
  }

  public async fetchMany<TDTO = unknown>(
    identities: MetadataIdentity[],
    _context?: ProviderExecutionContext
  ): Promise<ProviderResult<TDTO>[]> {
    const startMs = Date.now();

    try {
      const overridesMap = await this.repository.getOverridesForMany(identities);

      return identities.map((identity) => {
        const key = `${identity.entityKind}:${String(identity.entityId)}`;
        const overrides = overridesMap.get(key) ?? [];
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
      });
    } catch (error) {
      return identities.map(() => {
        return new ProviderResult<TDTO>({
          payload: null,
          confidence: MetadataConfidence.low(),
          error: error instanceof Error ? error.message : String(error),
          providerInfo: this.info,
          latencyMs: Date.now() - startMs,
          status: 'failed'
        });
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
  ): Promise<ProviderResult<TDTO>[]> {
    return this.fetchMany<TDTO>(identities, context);
  }

  public async shutdown(): Promise<void> {
    this.info.setDisabled();
  }
}
