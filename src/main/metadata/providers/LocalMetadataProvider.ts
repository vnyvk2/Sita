import type { MetadataCapability } from '../common/types';
import type { IMetadataProvider } from '../interfaces/IMetadataProvider';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { ProviderExecutionContext } from '../models/ProviderExecutionContext';
import type { DatabaseMetadataRepository } from '../repository/DatabaseMetadataRepository';

import { MetadataConfidence } from '../models/MetadataConfidence';
import { MetadataProviderInfo } from '../models/MetadataProviderInfo';
import { ProviderResult } from '../models/ProviderResult';

export class LocalMetadataProvider implements IMetadataProvider {
  public readonly info: MetadataProviderInfo;
  private readonly repository: DatabaseMetadataRepository;

  constructor(repository: DatabaseMetadataRepository) {
    this.repository = repository;
    this.info = new MetadataProviderInfo({
      id: 'local',
      displayName: 'Local Metadata Repository',
      version: '1.0.0',
      priority: 80,
      capabilities: ['ReadTags', 'ReadDatabase'],
      isOnline: false
    });
  }

  public async initialize(): Promise<void> {
    this.info.state = 'Ready';
  }

  public supports(capability: MetadataCapability): boolean {
    return this.info.supports(capability);
  }

  public async fetch<TDTO = unknown>(
    identity: MetadataIdentity,
    _execContext?: ProviderExecutionContext
  ): Promise<ProviderResult<TDTO>> {
    const startTime = Date.now();
    try {
      const dto = await this.repository.findDTO<TDTO>(identity);
      const latencyMs = Date.now() - startTime;

      if (!dto) {
        return new ProviderResult<TDTO>({
          payload: null,
          confidence: MetadataConfidence.low(),
          providerInfo: this.info,
          latencyMs,
          status: 'success'
        });
      }

      return new ProviderResult<TDTO>({
        payload: dto,
        confidence: MetadataConfidence.verified(),
        providerInfo: this.info,
        latencyMs,
        status: 'success'
      });
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      return new ProviderResult<TDTO>({
        payload: null,
        confidence: MetadataConfidence.low(),
        providerInfo: this.info,
        latencyMs,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  public async refresh<TDTO = unknown>(
    identity: MetadataIdentity,
    execContext?: ProviderExecutionContext
  ): Promise<ProviderResult<TDTO>> {
    return this.fetch<TDTO>(identity, execContext);
  }

  public async shutdown(): Promise<void> {
    this.info.state = 'Disabled';
  }

  public getCapabilities(): Set<MetadataCapability> {
    return this.info.capabilities;
  }
}
