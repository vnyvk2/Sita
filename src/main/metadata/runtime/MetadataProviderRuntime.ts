import type { IMetadataProviderAdapter, IProviderLifecycle } from '../contracts/IMetadataProviderAdapter';
import type { ProviderConfiguration } from '../contracts/ProviderConfiguration';
import { ProviderState, type ProviderStatus } from '../contracts/ProviderStatus';
import type { AlbumMetadata, MetadataProviderId, ResolvedAlbumRelease } from '../models/RecordingMetadata';
import { MetadataNormalizer } from '../matching/MetadataNormalizer';

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
    adapters?: IMetadataProviderAdapter | IMetadataProviderAdapter[],
    config?: Partial<ProviderConfiguration>,
    options?: ProviderRuntimeOptions
  ) {
    const adapterList = adapters ? (Array.isArray(adapters) ? adapters : [adapters]) : [];
    for (const adapter of adapterList) {
      if (adapter && adapter.identity) {
        this.providers.set(adapter.identity.id.toLowerCase(), adapter);
      }
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
    if (adapter && adapter.identity) {
      this.providers.set(adapter.identity.id.toLowerCase(), adapter);
    }
  }

  public getProvider(providerId: string): IMetadataProviderAdapter | undefined {
    return this.providers.get(providerId.toLowerCase());
  }

  public getProviders(): IMetadataProviderAdapter[] {
    return this.getSortedAdapters();
  }

  /**
   * Primary adapter instance accessor for single-provider registry compatibility.
   */
  public get adapterInstance(): IMetadataProviderAdapter {
    const primary = this.getSortedAdapters()[0];
    if (!primary) {
      throw new Error('No registered metadata provider adapters found in runtime.');
    }
    return primary;
  }

  public getProviderStatuses(): Map<string, ProviderStatus> {
    const map = new Map<string, ProviderStatus>();
    for (const [id] of this.providers.entries()) {
      map.set(id, this.status);
    }
    return map;
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
      for (const adapter of this.getSortedAdapters()) {
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
      for (const adapter of this.getSortedAdapters()) {
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
   * Search albums concurrently across registered providers sorted by priority.
   * Merges, deduplicates by normalized title::artist, and ranks search results cleanly.
   */
  public async searchAlbums(album: string, artist?: string, limit = 10): Promise<AlbumMetadata[]> {
    if (!this.isAvailable() || this.providers.size === 0) return [];

    const adapters = this.getSortedAdapters();
    const searchPromises = adapters.map(async (adapter) => {
      if (typeof adapter.searchAlbums === 'function') {
        return adapter.searchAlbums(album, artist, limit);
      }
      return [];
    });

    const results = await Promise.allSettled(searchPromises);
    const rawAlbums: AlbumMetadata[] = [];

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      if (res.status === 'fulfilled') {
        rawAlbums.push(...res.value);
        this.recordSuccess();
      } else {
        const msg = res.reason instanceof Error ? res.reason.message : String(res.reason);
        this.recordFailure(msg);
      }
    }

    // Deduplicate and rank search results
    return this.deduplicateAndRankAlbums(rawAlbums, album, artist);
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
    const adapter = this.providers.get(targetProviderId) ?? this.getSortedAdapters()[0];

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

  private getSortedAdapters(): IMetadataProviderAdapter[] {
    return Array.from(this.providers.values()).sort((a, b) => {
      const prioA = (a as unknown as { configuration?: ProviderConfiguration }).configuration?.priority ?? 500;
      const priob = (b as unknown as { configuration?: ProviderConfiguration }).configuration?.priority ?? 500;
      return prioA - priob;
    });
  }

  private deduplicateAndRankAlbums(albums: AlbumMetadata[], targetAlbum: string, targetArtist?: string): AlbumMetadata[] {
    const seen = new Set<string>();
    const deduplicated: AlbumMetadata[] = [];

    for (const alb of albums) {
      const normTitle = MetadataNormalizer.normalizeAlbum(alb.title);
      const normArtist = MetadataNormalizer.normalizeArtist(alb.artist);
      const key = `${normTitle}::${normArtist}`;

      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(alb);
      }
    }

    const normTargetAlbum = MetadataNormalizer.normalizeAlbum(targetAlbum);
    const normTargetArtist = targetArtist ? MetadataNormalizer.normalizeArtist(targetArtist) : '';

    deduplicated.sort((a, b) => {
      const titleMatchA = MetadataNormalizer.normalizeAlbum(a.title) === normTargetAlbum ? 50 : 0;
      const titleMatchB = MetadataNormalizer.normalizeAlbum(b.title) === normTargetAlbum ? 50 : 0;
      const artistMatchA = normTargetArtist && MetadataNormalizer.normalizeArtist(a.artist) === normTargetArtist ? 20 : 0;
      const artistMatchB = normTargetArtist && MetadataNormalizer.normalizeArtist(b.artist) === normTargetArtist ? 20 : 0;

      const scoreA = titleMatchA + artistMatchA;
      const scoreB = titleMatchB + artistMatchB;

      return scoreB - scoreA;
    });

    return deduplicated;
  }
}
