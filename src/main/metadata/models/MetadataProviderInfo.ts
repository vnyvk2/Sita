import type { MetadataCapability } from '../common/types';

export interface MetadataProviderInfoOptions {
  id: string;
  name: string;
  version: string;
  priority: number;
  capabilities: Set<MetadataCapability>;
  enabled?: boolean;
}

export class MetadataProviderInfo {
  public readonly id: string;
  public readonly name: string;
  public readonly version: string;
  public readonly priority: number;
  public readonly capabilities: Set<MetadataCapability>;
  public readonly enabled: boolean;

  constructor(options: MetadataProviderInfoOptions) {
    this.id = options.id;
    this.name = options.name;
    this.version = options.version;
    this.priority = options.priority;
    this.capabilities = options.capabilities;
    this.enabled = options.enabled ?? true;
  }

  public supports(capability: MetadataCapability): boolean {
    return this.capabilities.has(capability);
  }
}
