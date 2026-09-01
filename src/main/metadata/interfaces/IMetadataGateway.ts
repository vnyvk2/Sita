import type { MetadataEntity } from '../models/MetadataEntity';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { ProviderExecutionContext } from '../models/ProviderExecutionContext';

export interface IMetadataGateway {
  load(
    identity: MetadataIdentity,
    execContext?: ProviderExecutionContext
  ): Promise<MetadataEntity | null>;

  loadMany(
    identities: MetadataIdentity[],
    execContext?: ProviderExecutionContext
  ): Promise<MetadataEntity[]>;

  refresh(
    identity: MetadataIdentity,
    execContext?: ProviderExecutionContext
  ): Promise<MetadataEntity | null>;

  refreshMany(
    identities: MetadataIdentity[],
    execContext?: ProviderExecutionContext
  ): Promise<MetadataEntity[]>;

  preload(identities: MetadataIdentity[], execContext?: ProviderExecutionContext): void;
}
