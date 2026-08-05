import type { IMetadataProviderAdapter, IProviderLifecycle } from '../contracts/IMetadataProviderAdapter';
import type { ProviderConfiguration } from '../contracts/ProviderConfiguration';
import { ProviderState, type ProviderStatus } from '../contracts/ProviderStatus';
import type { AlbumMetadata, MetadataProviderId, ResolvedAlbumRelease } from '../models/RecordingMetadata';

export interface ProviderRuntimeOptions {
  failureThresholdBeforeDegraded?: number;
  failureThresholdBeforeOffline?: number;
  healthRecoveryTimeoutMs?: number;
}

export class MetadataProviderRuntime {
  private readonly providers: Map<string, IMetadataProviderAdapter> = new Map();
  private readonly config: ProviderConfiguration;
  private readonly options: ProviderRuntimeOptions;

  private statusState: ProviderStatus;

  constructor(
    adapters: IMetadataProviderAdapter | IMetadataProviderAdapter[],
    config?: Partial<ProviderConfiguration>,
    options?: ProviderRuntimeOptions
  ) {
    const adapterList = Array.isArray(adapters) ? adapters : [adapters];
    for (const adapter of adapterList) {
      this.providers.set(adapter.identity.id.toLowerCase(), adapter);
    }

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

  public registerProvider(adapter: IMetadataProviderAdapter): void {
    this.providers.set(adapter.identity.id.toLowerCase(), adapter);
  }

  public getProvider(providerId: string): IMetadataProviderAdapter | undefined {
    return this.providers.get(providerId.toLowerCase());
  }

  public get adapterInstance(): IMetadataProviderAdapter {
    const first = this.providers.values().next().value;
    if (!first) throw new Error('No registered metadata provider adapters found.');
    return first;
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
      for (const adapter of this.providers.values()) {
        const lifecycle = adapter as unknown as IProviderLifecycle;
        if (typeof lifecycle.initialize === 'function') {
          await lifecycle.initialize(this.config);
        }
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
      for (const adapter of this.providers.values()) {
        const lifecycle = adapter as unknown as IProviderLifecycle;
        if (typeof lifecycle.shutdown === 'function') {
          await lifecycle.shutdown();
        }
      }
    } finally {
      this.statusState.state = ProviderState.Uninitialized;
    }
  }

  /**
   * Search albums across active metadata providers.
   */
  public async searchAlbums(album: string, artist?: string, limit = 10): Promise<AlbumMetadata[]> {
    if (!this.isAvailable()) return [];

    const allAlbums: AlbumMetadata[] = [];
    for (const adapter of this.providers.values()) {
      if (typeof adapter.searchAlbums === 'function') {
        try {
          const results = await adapter.searchAlbums(album, artist, limit);
          this.recordSuccess();
          allAlbums.push(...results);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.recordFailure(msg);
        }
      }
    }

    return allAlbums;
  }

  /**
   * Resolve album release details preserved by specific provider identity.
   */
  public async resolveRelease(
    providerReleaseId: string,
    providerId?: MetadataProviderId
  ): Promise<ResolvedAlbumRelease | null> {
    if (!this.isAvailable() || !providerReleaseId) return null;

    const targetProviderId = providerId?.toLowerCase() ?? 'musicbrainz';
    const adapter = this.providers.get(targetProviderId) ?? this.providers.values().next().value;

    if (adapter && typeof adapter.resolveRelease === 'function') {
      try {
        const resolved = await adapter.resolveRelease(providerReleaseId);
        if (resolved) {
          this.recordSuccess();
          return resolved;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.recordFailure(msg);
      }
    }

    return null;
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
