import type { MetadataEntity } from '../models/MetadataEntity';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { MetadataProviderInfo } from '../models/MetadataProviderInfo';

export interface MetadataEntityEvent {
  identity: MetadataIdentity;
  entity?: MetadataEntity;
}

export interface MetadataFieldChangedEvent extends MetadataEntityEvent {
  changedFields: string[];
}

export interface MetadataImportedEvent {
  providerId: string;
  importedCount: number;
}

export interface ProviderLifecycleEvent {
  provider: MetadataProviderInfo;
  reason?: string;
}

export interface MetadataEventMap {
  MetadataLoaded: (event: MetadataEntityEvent) => void;
  MetadataCreated: (event: MetadataEntityEvent) => void;
  MetadataChanged: (event: MetadataFieldChangedEvent) => void;
  MetadataDeleted: (event: MetadataEntityEvent) => void;
  MetadataMerged: (event: MetadataEntityEvent) => void;
  MetadataImported: (event: MetadataImportedEvent) => void;
  MetadataRefreshed: (event: MetadataEntityEvent) => void;
  ProviderRegistered: (event: ProviderLifecycleEvent) => void;
  ProviderFailed: (event: ProviderLifecycleEvent) => void;
  ProviderUpdated: (event: ProviderLifecycleEvent) => void;
}
