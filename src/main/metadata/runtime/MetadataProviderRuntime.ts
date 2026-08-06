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
  private readonly providerStatuses: Map<string, ProviderStatus> = new Map();
  private readonly config: ProviderConfiguration;
  private readonly options: ProviderRuntimeOptions;

  constructor(
    adapters?: IMetadataProviderAdapter | IMetadataProviderAdapter[],
    config?: Partial<ProviderConfiguration>,
    options?: ProviderRuntimeOptions
  ) {
    const adapterList = adapters ? (Array.isArray(adapters) ? adapters : [adapters]) : [];
    for (const adapter of adapterList) {
      if (adapter && adapter.identity) {
        this.registerProviderInternal(adapter, true);
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
  }

  public registerProvider(adapter: IMetadataProviderAdapter, overwrite = false): void {
    this.registerProviderInternal(adapter, overwrite);
  }

  private registerProviderInternal(adapter: IMetadataProviderAdapter, overwrite: boolean): void {
    const key = adapter.identity.id.toLowerCase();
    if (this.providers.has(key) && !overwrite) {
      throw new Error(`Metadata provider '${adapter.identity.id}' is already registered. Set overwrite=true to replace.`);
    }

    this.providers.set(key, adapter);
    this.providerStatuses.set(key, {
      state: ProviderState.Uninitialized,
      consecutiveFailures: 0
    });
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

  public getProviderStatus(providerId: string): ProviderStatus | undefined {
    return this.providerStatuses.get(providerId.toLowerCase());
  }

  public getProviderStatuses(): Map<string, ProviderStatus> {
    return new Map(this.providerStatuses);
  }

  public get status(): ProviderStatus {
    const statuses = Array.from(this.providerStatuses.values());
    if (statuses.length === 0) return { state: ProviderState.Uninitialized, consecutiveFailures: 0 };
    const hasUninitialized = statuses.every((s) => s.state === ProviderState.Uninitialized);
    if (hasUninitialized) return { state: ProviderState.Uninitialized, consecutiveFailures: 0 };
    const hasHealthy = statuses.some((s) => s.state === ProviderState.Healthy);
    if (hasHealthy) return { state: ProviderState.Healthy, consecutiveFailures: 0 };
    const hasDegraded = statuses.some((s) => s.state === ProviderState.Degraded);
    if (hasDegraded) return { state: ProviderState.Degraded, consecutiveFailures: 1 };
    const hasOffline = statuses.some((s) => s.state === ProviderState.Offline);
    if (hasOffline) return { state: ProviderState.Offline, consecutiveFailures: 5 };
    return { state: ProviderState.Failed, consecutiveFailures: 5 };
  }

  public get configuration(): ProviderConfiguration {
    return { ...this.config };
  }

  public async initialize(): Promise<void> {
    if (!this.config.enabled) {
      for (const key of this.providerStatuses.keys()) {
        this.providerStatuses.set(key, { state: ProviderState.Offline, consecutiveFailures: 0 });
      }
      return;
    }

    for (const [id, adapter] of this.providers.entries()) {
      this.providerStatuses.set(id, { state: ProviderState.Initializing, consecutiveFailures: 0 });
      try {
        const lifecycle = adapter as unknown as IProviderLifecycle;
        if (typeof lifecycle.initialize === 'function') {
          await lifecycle.initialize(this.config);
        }
        this.providerStatuses.set(id, {
          state: ProviderState.Healthy,
          consecutiveFailures: 0,
          lastHealthCheck: Date.now()
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.providerStatuses.set(id, {
          state: ProviderState.Failed,
          consecutiveFailures: 1,
          lastErrorMessage: msg,
          lastHealthCheck: Date.now()
        });
      }
    }
  }

  public async shutdown(): Promise<void> {
    for (const [id, adapter] of this.providers.entries()) {
      try {
        const lifecycle = adapter as unknown as IProviderLifecycle;
        if (typeof lifecycle.shutdown === 'function') {
          await lifecycle.shutdown();
        }
      } finally {
        this.providerStatuses.set(id, { state: ProviderState.Uninitialized, consecutiveFailures: 0 });
      }
    }
  }

  /**
   * Search albums concurrently across registered providers sorted by priority.
   * Merges, deduplicates by title::artist::year, and ranks search results cleanly.
   */
  public async searchAlbums(album: string, artist?: string, limit = 10): Promise<AlbumMetadata[]> {
    if (!this.isAvailable() || this.providers.size === 0) return [];

    const adapters = this.getSortedAdapters();
    const searchPromises = adapters.map(async (adapter) => {
      const providerId = adapter.identity.id.toLowerCase();
      if (typeof adapter.searchAlbums === 'function') {
        const startTime = Date.now();
        const results = await adapter.searchAlbums(album, artist, limit);
        this.recordSuccess(providerId, Date.now() - startTime);
        return results;
      }
      return [];
    });

    const results = await Promise.allSettled(searchPromises);
    const rawAlbums: AlbumMetadata[] = [];

    for (let i = 0; i < results.length; i++) {
      const adapter = adapters[i];
      const providerId = adapter.identity.id.toLowerCase();
      const res = results[i];

      if (res.status === 'fulfilled') {
        rawAlbums.push(...res.value);
      } else {
        const msg = res.reason instanceof Error ? res.reason.message : String(res.reason);
        this.recordFailure(providerId, msg);
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
      const startTime = Date.now();
      try {
        const resolved = await adapter.resolveRelease(providerReleaseId);
        if (resolved) {
          this.recordSuccess(targetProviderId, Date.now() - startTime);
          return resolved;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.recordFailure(targetProviderId, msg);
        throw err;
      }
    }

    return null;
  }

  public recordSuccess(providerIdOrLatency?: string | number, latencyMs?: number): void {
    let targetProviderId = typeof providerIdOrLatency === 'string' ? providerIdOrLatency : undefined;
    let latency = typeof providerIdOrLatency === 'number' ? providerIdOrLatency : latencyMs;

    if (!targetProviderId) {
      targetProviderId = this.getSortedAdapters()[0]?.identity.id ?? 'musicbrainz';
    }

    const key = targetProviderId.toLowerCase();
    this.providerStatuses.set(key, {
      state: ProviderState.Healthy,
      consecutiveFailures: 0,
      lastHealthCheck: Date.now(),
      latencyMs: latency
    });
  }

  public recordFailure(providerIdOrMsg: string, errorMessage?: string): void {
    let targetProviderId: string;
    let msg: string;

    if (errorMessage !== undefined) {
      targetProviderId = providerIdOrMsg;
      msg = errorMessage;
    } else {
      targetProviderId = this.getSortedAdapters()[0]?.identity.id ?? 'musicbrainz';
      msg = providerIdOrMsg;
    }

    const key = targetProviderId.toLowerCase();
    const current = this.providerStatuses.get(key);
    const failures = (current?.consecutiveFailures ?? 0) + 1;
    let nextState = current?.state ?? ProviderState.Healthy;

    if (failures >= (this.options.failureThresholdBeforeOffline ?? 5)) {
      nextState = ProviderState.Offline;
    } else if (failures >= (this.options.failureThresholdBeforeDegraded ?? 3)) {
      nextState = ProviderState.Degraded;
    }

    this.providerStatuses.set(key, {
      state: nextState,
      consecutiveFailures: failures,
      lastErrorMessage: msg,
      lastHealthCheck: Date.now()
    });
  }

  public isAvailable(): boolean {
    if (!this.config.enabled) return false;
    for (const status of this.providerStatuses.values()) {
      if (status.state === ProviderState.Healthy || status.state === ProviderState.Degraded) {
        return true;
      }
    }
    return false;
  }

  private getSortedAdapters(): IMetadataProviderAdapter[] {
    return Array.from(this.providers.values()).sort((a, b) => {
      const prioA = a.priority ?? 500;
      const prioB = b.priority ?? 500;
      return prioA - prioB;
    });
  }

  private deduplicateAndRankAlbums(albums: AlbumMetadata[], targetAlbum: string, targetArtist?: string): AlbumMetadata[] {
    const seen = new Set<string>();
    const deduplicated: AlbumMetadata[] = [];

    for (const alb of albums) {
      const normTitle = MetadataNormalizer.normalizeAlbum(alb.title);
      const normArtist = MetadataNormalizer.normalizeArtist(alb.artist);
      const yearKey = alb.year ?? 'unknown';
      const key = `${normTitle}::${normArtist}::${yearKey}`;

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

      const officialA = a.releaseType?.toLowerCase().includes('official') || a.releaseType?.toLowerCase().includes('album') ? 5 : 0;
      const officialB = b.releaseType?.toLowerCase().includes('official') || b.releaseType?.toLowerCase().includes('album') ? 5 : 0;

      const scoreA = titleMatchA + artistMatchA + officialA;
      const scoreB = titleMatchB + artistMatchB + officialB;

      return scoreB - scoreA;
    });

    return deduplicated;
  }
}
