import type { MetadataCapability } from '../common/types';
import type { IMetadataProvider } from '../interfaces/IMetadataProvider';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { ProviderExecutionContext } from '../models/ProviderExecutionContext';
import type { DatabaseMetadataRepository } from '../repository/DatabaseMetadataRepository';

import { MetadataCapabilities } from '../common/types';
import { MetadataConfidence } from '../models/MetadataConfidence';
import { MetadataProviderInfo } from '../models/MetadataProviderInfo';
import { ProviderResult } from '../models/ProviderResult';

export class LocalMetadataProvider implements IMetadataProvider {
  public readonly info: MetadataProviderInfo;
  private readonly repository: DatabaseMetadataRepository;
  private readonly capabilities: Set<MetadataCapability>;

  constructor(repository: DatabaseMetadataRepository) {
    this.repository = repository;
    this.info = new MetadataProviderInfo({
      id: 'local',
      displayName: 'Local Database Provider',
      version: '1.0.0',
      priority: 100
    });
    this.capabilities = new Set<MetadataCapability>([
      MetadataCapabilities.Tags,
      MetadataCapabilities.Genre
    ]);
  }

  public async initialize(): Promise<void> {
    this.info.setReady();
  }

  public supports(capability: MetadataCapability): boolean {
    return this.capabilities.has(capability);
  }

  public getCapabilities(): Set<MetadataCapability> {
    return this.capabilities;
  }

  public async fetch<TDTO = unknown>(
    identity: MetadataIdentity,
    _execContext?: ProviderExecutionContext
  ): Promise<ProviderResult<TDTO>> {
    const startTime = Date.now();
    try {
      const dto = await this.repository.loadRawData<TDTO>(identity);
      const latencyMs = Date.now() - startTime;

      if (!dto) {
        return new ProviderResult<TDTO>({
          payload: null,
          confidence: MetadataConfidence.low(),
          providerInfo: this.info,
          latencyMs,
          status: 'failed',
          error: `Local entity not found for identity: ${identity.toString()}`
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

  public async fetchMany<TDTO = unknown>(
    identities: MetadataIdentity[],
    _execContext?: ProviderExecutionContext
  ): Promise<ProviderResult<TDTO>[]> {
    const startTime = Date.now();
    try {
      const rawResults = await this.repository.loadMany<TDTO>(identities);
      const latencyMs = Date.now() - startTime;

      return identities.map((identity, i) => {
        const dto = rawResults[i];
        if (!dto) {
          return new ProviderResult<TDTO>({
            payload: null,
            confidence: MetadataConfidence.low(),
            providerInfo: this.info,
            latencyMs,
            status: 'failed',
            error: `Local entity not found for identity: ${identity.toString()}`
          });
        }

        return new ProviderResult<TDTO>({
          payload: dto,
          confidence: MetadataConfidence.verified(),
          providerInfo: this.info,
          latencyMs,
          status: 'success'
        });
      });
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      return identities.map(
        () =>
          new ProviderResult<TDTO>({
            payload: null,
            confidence: MetadataConfidence.low(),
            providerInfo: this.info,
            latencyMs,
            status: 'failed',
            error: err instanceof Error ? err.message : String(err)
          })
      );
    }
  }

  public async refresh<TDTO = unknown>(
    identity: MetadataIdentity,
    execContext?: ProviderExecutionContext
  ): Promise<ProviderResult<TDTO>> {
    return this.fetch<TDTO>(identity, execContext);
  }

  public async refreshMany<TDTO = unknown>(
    identities: MetadataIdentity[],
    execContext?: ProviderExecutionContext
  ): Promise<ProviderResult<TDTO>[]> {
    return this.fetchMany<TDTO>(identities, execContext);
  }

  public async shutdown(): Promise<void> {
    this.info.setDisabled();
  }
}
