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
  public readonly isOnline: boolean;

  private _state: ProviderState;
  private _enabled: boolean;

  constructor(options: MetadataProviderInfoOptions) {
    this.id = options.id;
    this.displayName = options.displayName;
    this.version = options.version;
    this.priority = options.priority ?? 50;
    this.capabilities = new Set(options.capabilities ?? []);
    this._state = options.state ?? ProviderStates.Ready;
    this._enabled = options.enabled ?? true;
    this.isOnline = options.isOnline ?? false;
  }

  public get state(): ProviderState {
    return this._state;
  }

  public get enabled(): boolean {
    return this._enabled;
  }

  public setState(state: ProviderState): void {
    this._state = state;
  }

  public setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  public setReady(): void {
    this._state = ProviderStates.Ready;
  }

  public setDisabled(): void {
    this._state = ProviderStates.Disabled;
    this._enabled = false;
  }

  public setFailed(): void {
    this._state = ProviderStates.Failed;
  }

  public supports(capability: MetadataCapability): boolean {
    return this.capabilities.has(capability);
  }
}
