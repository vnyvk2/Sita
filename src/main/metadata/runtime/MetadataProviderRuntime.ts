import type { IMetadataProviderAdapter, IProviderLifecycle } from '../contracts/IMetadataProviderAdapter';
import type { ProviderConfiguration } from '../contracts/ProviderConfiguration';
import { ProviderState, type ProviderStatus } from '../contracts/ProviderStatus';
import type { AlbumMetadata, MetadataProviderId, ResolvedAlbumRelease } from '../models/RecordingMetadata';
import type { MetadataSearchOptions } from '../../../common/metadata/api';
import { MetadataNormalizer } from '../matching/MetadataNormalizer';
import { MetadataPreferencesService } from '../services/MetadataPreferencesService';
import { DiscoveryCandidateSorter } from '../search/DiscoveryCandidateSorter';
import { MetadataSearchRankingEngine, type SearchCandidate } from '../search/MetadataSearchRankingEngine';
import { MetadataQueryNormalizer } from '../search/MetadataQueryNormalizer';

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
  private readonly preferencesService?: MetadataPreferencesService;

  constructor(
    adapters?: IMetadataProviderAdapter | IMetadataProviderAdapter[],
    config?: Partial<ProviderConfiguration>,
    options?: ProviderRuntimeOptions,
    preferencesService?: MetadataPreferencesService
  ) {
    this.preferencesService = preferencesService;
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
  public get primaryAdapter(): IMetadataProviderAdapter | undefined {
    return this.getSortedAdapters()[0];
  }

  /**
   * Compatibility accessor returning primary adapter instance for single-adapter consumers.
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

  public isAvailable(): boolean {
    if (!this.config.enabled || this.providers.size === 0) return false;
    for (const status of this.providerStatuses.values()) {
      if (status.state === ProviderState.Healthy || status.state === ProviderState.Degraded) {
        return true;
      }
    }
    return false;
  }

  public async initialize(): Promise<void> {
    for (const [id, adapter] of this.providers.entries()) {
      try {
        const lifecycle = adapter as unknown as IProviderLifecycle;
        if (typeof lifecycle.initialize === 'function') {
          await lifecycle.initialize();
        }
        this.providerStatuses.set(id, { state: ProviderState.Healthy, consecutiveFailures: 0 });
      } catch {
        this.providerStatuses.set(id, { state: ProviderState.Offline, consecutiveFailures: 1 });
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
   * Search albums concurrently across registered providers according to preferences and timeout isolation.
   * Normalizes candidates into common SearchCandidate, ranks them, and applies priority tie-breakers.
   */
  public async searchAlbums(
    album: string,
    artist?: string,
    options?: MetadataSearchOptions
  ): Promise<AlbumMetadata[]> {
    if (!this.isAvailable() || this.providers.size === 0 || !album) return [];

    const limit = options?.limit ?? 10;
    const targetTrackCount = options?.targetTrackCount;
    const sourceOverride = options?.source;

    let targetAdapters: IMetadataProviderAdapter[] = [];
    let providerPriority: MetadataProviderId[] = ['musicbrainz'];

    if (sourceOverride && sourceOverride !== 'auto') {
      const explicitAdapter = this.providers.get(sourceOverride.toLowerCase());
      if (explicitAdapter) {
        targetAdapters = [explicitAdapter];
        providerPriority = [sourceOverride];
      } else {
        return [];
      }
    } else {
      const prefs = this.preferencesService ? await this.preferencesService.getPreferences() : undefined;
      if (prefs) {
        const enabledSet = new Set((prefs.enabledSearchProviders ?? ['musicbrainz']).map((s) => s.toLowerCase()));
        providerPriority = prefs.searchProviderPriority ?? ['musicbrainz'];
        targetAdapters = this.getSortedAdapters().filter((adapter) =>
          enabledSet.has(adapter.identity.id.toLowerCase())
        );
      } else {
        targetAdapters = this.getSortedAdapters();
        providerPriority = targetAdapters.map((a) => a.identity.id as MetadataProviderId);
      }

      if (targetAdapters.length === 0) {
        const defaultMB = this.providers.get('musicbrainz');
        if (defaultMB) targetAdapters = [defaultMB];
      }
    }

    const searchPromises = targetAdapters.map(async (adapter) => {
      const providerId = adapter.identity.id.toLowerCase();
      if (typeof adapter.searchAlbums === 'function') {
        const startTime = Date.now();
        const timeoutMs = 4000;

        const timeoutPromise = new Promise<never>((_resolve, reject) =>
          setTimeout(() => reject(new Error(`Search timeout (${timeoutMs}ms) for provider '${providerId}'`)), timeoutMs)
        );

        try {
          const results = await Promise.race([
            adapter.searchAlbums(album, artist, limit, targetTrackCount),
            timeoutPromise
          ]);
          this.recordSuccess(providerId, Date.now() - startTime);
          return results;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.recordFailure(providerId, msg);
          return [];
        }
      }
      return [];
    });

    const results = await Promise.allSettled(searchPromises);
    const rawAlbums: AlbumMetadata[] = [];

    for (const res of results) {
      if (res.status === 'fulfilled') {
        rawAlbums.push(...res.value);
      }
    }

    if (rawAlbums.length === 0) return [];

    // Deduplicate on (title::artist::year)
    const seen = new Set<string>();
    const deduplicatedAlbums: AlbumMetadata[] = [];
    for (const alb of rawAlbums) {
      const normTitle = MetadataNormalizer.normalizeAlbum(alb.title);
      const normArtist = MetadataNormalizer.normalizeArtist(alb.artist);
      const yearKey = alb.year ?? 'unknown';
      const key = `${normTitle}::${normArtist}::${yearKey}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicatedAlbums.push(alb);
      }
    }

    // Score and Rank through DiscoveryCandidateSorter
    const normQuery = MetadataQueryNormalizer.normalize(album, artist);
    const scoredCandidates = deduplicatedAlbums.map((alb) => {
      const candidate: SearchCandidate = {
        id: alb.releaseId || alb.title,
        title: alb.title,
        artist: alb.artist,
        year: alb.year,
        trackCount: alb.trackCount,
        baseScore: alb.rankingScore ?? 80,
        primaryType: alb.releaseType,
        rawItem: alb
      };
      const scored = MetadataSearchRankingEngine.scoreCandidate(candidate, normQuery, targetTrackCount);
      return { album: alb, scored };
    });

    const sorted = DiscoveryCandidateSorter.sortCandidates(scoredCandidates, providerPriority);
    return sorted.slice(0, limit).map((r) => ({
      ...r.album,
      rankingScore: Math.round(r.scored.totalScore)
    }));
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
    const latency = typeof providerIdOrLatency === 'number' ? providerIdOrLatency : latencyMs;

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

  private getSortedAdapters(): IMetadataProviderAdapter[] {
    return Array.from(this.providers.values()).sort((a, b) => {
      const prioA = a.priority ?? 500;
      const prioB = b.priority ?? 500;
      return prioA - prioB;
    });
  }
}
