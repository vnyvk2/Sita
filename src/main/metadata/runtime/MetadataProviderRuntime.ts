import type { IMetadataProviderAdapter, IProviderLifecycle } from '../contracts/IMetadataProviderAdapter';
import type { ProviderConfiguration } from '../contracts/ProviderConfiguration';
import { ProviderState, type ProviderStatus } from '../contracts/ProviderStatus';

export interface ProviderRuntimeOptions {
  failureThresholdBeforeDegraded?: number;
  failureThresholdBeforeOffline?: number;
  healthRecoveryTimeoutMs?: number;
}

export class MetadataProviderRuntime {
  private readonly adapter: IMetadataProviderAdapter;
  private readonly config: ProviderConfiguration;
  private readonly options: ProviderRuntimeOptions;

  private statusState: ProviderStatus;

  constructor(
    adapter: IMetadataProviderAdapter,
    config?: Partial<ProviderConfiguration>,
    options?: ProviderRuntimeOptions
  ) {
    this.adapter = adapter;
    this.config = {
      enabled: config?.enabled ?? true,
      priority: config?.priority ?? 500,
      ...config
    };
    this.options = {
      failureThresholdBeforeDegraded: options?.failureThresholdBeforeDegraded ?? 3,
      failureThresholdBeforeOffline: options?.failureThresholdBeforeOffline ?? 5,
      healthRecoveryTimeoutMs: options?.healthRecoveryTimeoutMs ?? 60000
    };

    this.statusState = {
      state: ProviderState.Uninitialized,
      consecutiveFailures: 0
    };
  }

  public get adapterInstance(): IMetadataProviderAdapter {
    return this.adapter;
  }

  public get status(): ProviderStatus {
    return { ...this.statusState };
  }

  public get configuration(): ProviderConfiguration {
    return { ...this.config };
  }

  public async initialize(): Promise<void> {
    if (!this.config.enabled) {
      this.statusState.state = ProviderState.Offline;
      return;
    }

    this.statusState.state = ProviderState.Initializing;
    try {
      const lifecycle = this.adapter as unknown as IProviderLifecycle;
      if (typeof lifecycle.initialize === 'function') {
        await lifecycle.initialize(this.config);
      }
      this.statusState = {
        state: ProviderState.Healthy,
        consecutiveFailures: 0,
        lastHealthCheck: Date.now()
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.statusState = {
        state: ProviderState.Failed,
        consecutiveFailures: 1,
        lastErrorMessage: msg,
        lastHealthCheck: Date.now()
      };
      throw err;
    }
  }

  public async shutdown(): Promise<void> {
    try {
      const lifecycle = this.adapter as unknown as IProviderLifecycle;
      if (typeof lifecycle.shutdown === 'function') {
        await lifecycle.shutdown();
      }
    } finally {
      this.statusState.state = ProviderState.Uninitialized;
    }
  }

  public recordSuccess(latencyMs?: number): void {
    this.statusState = {
      state: ProviderState.Healthy,
      consecutiveFailures: 0,
      lastHealthCheck: Date.now(),
      latencyMs
    };
  }

  public recordFailure(errorMessage: string): void {
    const failures = this.statusState.consecutiveFailures + 1;
    let nextState = this.statusState.state;

    if (failures >= (this.options.failureThresholdBeforeOffline ?? 5)) {
      nextState = ProviderState.Offline;
    } else if (failures >= (this.options.failureThresholdBeforeDegraded ?? 3)) {
      nextState = ProviderState.Degraded;
    }

    this.statusState = {
      state: nextState,
      consecutiveFailures: failures,
      lastErrorMessage: errorMessage,
      lastHealthCheck: Date.now()
    };
  }

  public isAvailable(): boolean {
    if (!this.config.enabled) return false;
    return (
      this.statusState.state === ProviderState.Healthy ||
      this.statusState.state === ProviderState.Degraded
    );
  }
}
