import type { MetadataCapability } from '../common/types';
import type { ProviderState } from './ProviderState';

import { ProviderStates } from './ProviderState';

export interface MetadataProviderInfoOptions {
  id: string;
  displayName: string;
  version: string;
  priority?: number;
  capabilities?: MetadataCapability[];
  state?: ProviderState;
  enabled?: boolean;
  isOnline?: boolean;
}

export class MetadataProviderInfo {
  public readonly id: string;
  public readonly displayName: string;
  public readonly version: string;
  public readonly priority: number;
  public readonly capabilities: Set<MetadataCapability>;
  public state: ProviderState;
  public enabled: boolean;
  public readonly isOnline: boolean;

  constructor(options: MetadataProviderInfoOptions) {
    this.id = options.id;
    this.displayName = options.displayName;
    this.version = options.version;
    this.priority = options.priority ?? 50;
    this.capabilities = new Set(options.capabilities ?? []);
    this.state = options.state ?? ProviderStates.Ready;
    this.enabled = options.enabled ?? true;
    this.isOnline = options.isOnline ?? false;
  }

  public supports(capability: MetadataCapability): boolean {
    return this.capabilities.has(capability);
  }
}
