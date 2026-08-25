import type { AvailableSearchProviderInfo, MetadataSearchOptions } from '../../../common/metadata/api';
import { getProviderDisplayName } from '../../../common/metadata/displayNames';
import type { IMetadataProviderAdapter, IProviderLifecycle } from '../contracts/IMetadataProviderAdapter';
import { ProviderCapability } from '../contracts/ProviderCapabilities';
import type { ProviderConfiguration } from '../contracts/ProviderConfiguration';
import { ProviderState, type ProviderStatus } from '../contracts/ProviderStatus';
import { MetadataNormalizer } from '../matching/MetadataNormalizer';
import type { AlbumMetadata, MetadataProviderId, ResolvedAlbumRelease } from '../models/RecordingMetadata';
import { DiscoveryCandidateSorter } from '../search/DiscoveryCandidateSorter';
import { MetadataQueryNormalizer } from '../search/MetadataQueryNormalizer';
import { MetadataSearchRankingEngine, type SearchCandidate } from '../search/MetadataSearchRankingEngine';
import { MetadataPreferencesService } from '../services/MetadataPreferencesService';

export interface ProviderRuntimeOptions {
  failureThresholdBeforeDegraded?: number;
  failureThresholdBeforeOffline?: number;
  healthRecoveryTimeoutMs?: number;
}

/**
 * Per-provider wall-clock budget for a single searchAlbums call.
 *
 * Timeout hierarchy (innermost -> outermost):
 *   1. HTTP socket safety net ........ FetchHttpClient defaultTimeoutMs = 10_000ms
 *   2. Metadata stage timeout ........ ProviderTimeoutPolicy default = 5_000ms
 *                                      (execution-pipeline path only)
 *   3. Runtime search race ........... SEARCH_RACE_TIMEOUT_MS = 4_000ms (this file)
 *
 * Each layer must stay strictly smaller than the one above it so the outer
 * layer never fires first and masks the real cause.
 */
const SEARCH_RACE_TIMEOUT_MS = 4000;

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
    this.config = {
      enabled: config?.enabled ?? true,
      priority: config?.priority ?? 100,
      rateLimit: config?.rateLimit,
      retryPolicy: config?.retryPolicy,
      authCredentials: config?.authCredentials
    };

    this.options = {
      failureThresholdBeforeDegraded: options?.failureThresholdBeforeDegraded ?? 3,
      failureThresholdBeforeOffline: options?.failureThresholdBeforeOffline ?? 5,
      healthRecoveryTimeoutMs: options?.healthRecoveryTimeoutMs ?? 60000
    };

    this.preferencesService = preferencesService;

    if (adapters) {
      const adapterList = Array.isArray(adapters) ? adapters : [adapters];
      for (const adapter of adapterList) {
        this.registerProvider(adapter);
      }
    }
  }

  public registerProvider(adapter: IMetadataProviderAdapter, overwrite = false): void {
    const id = adapter.identity.id.toLowerCase();
    if (this.providers.has(id) && !overwrite) {
      throw new Error(`MetadataProviderAdapter with ID '${id}' is already registered in runtime.`);
    }

    this.providers.set(id, adapter);
    this.providerStatuses.set(id, {
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

  public getAvailableSearchProviders(): AvailableSearchProviderInfo[] {
    return this.getSortedAdapters()
      .filter(
        (adapter) =>
          adapter.supports?.(ProviderCapability.Search) ||
          adapter.capabilities?.has(ProviderCapability.Search) ||
          typeof adapter.searchAlbums === 'function'
      )
      .map((adapter) => {
        const id = adapter.identity.id as MetadataProviderId;
        return {
          id,
          displayName: getProviderDisplayName(id) || adapter.identity.name,
          isOnline: adapter.identity.providerType === 'online'
        };
      });
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

  public isHealthy(providerId?: string): boolean {
    if (providerId) {
      const status = this.getProviderStatus(providerId);
      return status?.state === ProviderState.Healthy || status?.state === ProviderState.Degraded;
    }
    return this.isAvailable();
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
    options?: MetadataSearchOptions,
    callerSignal?: AbortSignal
  ): Promise<AlbumMetadata[]> {
    if (!album || this.providers.size === 0) return [];

    const limit = options?.limit ?? 10;
    const targetTrackCount = options?.targetTrackCount;
    const sourceOverride = options?.source;

    let targetAdapters: IMetadataProviderAdapter[] = [];
    let providerPriority: MetadataProviderId[] = ['musicbrainz'];

    if (sourceOverride && sourceOverride !== 'auto') {
      const explicitAdapter = this.providers.get(sourceOverride.toLowerCase());
      if (!explicitAdapter) return [];
      const status = this.getProviderStatus(sourceOverride);
      if (status && status.state === ProviderState.Offline) return [];
      targetAdapters = [explicitAdapter];
      providerPriority = [sourceOverride];
    } else {
      if (!this.isAvailable()) return [];
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
        const timeoutMs = SEARCH_RACE_TIMEOUT_MS;
        const controller = new AbortController();
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

        const onParentAbort = () => controller.abort();
        if (callerSignal) {
          if (callerSignal.aborted) {
            controller.abort();
          } else {
            callerSignal.addEventListener('abort', onParentAbort);
          }
        }

        const timeoutPromise = new Promise<never>((_resolve, reject) => {
          timeoutHandle = setTimeout(() => {
            controller.abort();
            reject(new Error(`Search timeout (${timeoutMs}ms) for provider '${providerId}'`));
          }, timeoutMs);
        });

        try {
          const results = await Promise.race([
            adapter.searchAlbums(
              album,
              artist,
              { limit, targetTrackCount, source: sourceOverride, operationId: options?.operationId },
              controller.signal
            ),
            timeoutPromise
          ]);
          this.recordSuccess(providerId, Date.now() - startTime);
          return results;
        } catch (err: unknown) {
          const isCancellation =
            callerSignal?.aborted ||
            (err instanceof Error &&
              (err.name === 'AbortError' || (err as { code?: string }).code === 'ABORT_ERR'));
          if (!isCancellation) {
            const msg = err instanceof Error ? err.message : String(err);
            this.recordFailure(providerId, msg);
          }
          return [];
        } finally {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          if (callerSignal) callerSignal.removeEventListener('abort', onParentAbort);
        }
      }
      return [];
    });

    const results = await Promise.allSettled(searchPromises);
    const rawAlbums: AlbumMetadata[] = [];

    for (const res of results) {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        rawAlbums.push(...res.value);
      }
    }

    if (rawAlbums.length === 0) return [];

    // 1. Score ALL candidates intrinsically via MetadataSearchRankingEngine
    const normQuery = MetadataQueryNormalizer.normalize(album, artist);
    const scoredCandidates = rawAlbums.map((alb) => {
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

    // 2. Sort candidates using DiscoveryCandidateSorter with user provider priority
    const sorted = DiscoveryCandidateSorter.sortCandidates(scoredCandidates, providerPriority);

    // 3. Cluster/Deduplicate along the sorted list on canonical identity (normTitle::normArtist::yearKey)
    const seenClusters = new Set<string>();
    const finalRanked: AlbumMetadata[] = [];

    for (const item of sorted) {
      const alb = item.album;
      const normTitle = MetadataNormalizer.normalizeAlbum(alb.title);
      const normArtist = MetadataNormalizer.normalizeArtist(alb.artist);
      const yearKey = alb.year ?? 'unknown';
      const clusterKey = `${normTitle}::${normArtist}::${yearKey}`;

      if (!seenClusters.has(clusterKey)) {
        seenClusters.add(clusterKey);
        finalRanked.push({
          ...alb,
          rankingScore: Math.round(item.scored.totalScore)
        });
      }
    }

    return finalRanked.slice(0, limit);
  }

  /**
   * Resolve album release details preserved by specific provider identity.
   */
  public async resolveRelease(
    providerReleaseId: string,
    providerId?: MetadataProviderId
  ): Promise<ResolvedAlbumRelease | null> {
    if (!providerReleaseId) return null;

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
    let error: string;

    if (errorMessage !== undefined) {
      targetProviderId = providerIdOrMsg;
      error = errorMessage;
    } else {
      targetProviderId = this.getSortedAdapters()[0]?.identity.id ?? 'musicbrainz';
      error = providerIdOrMsg;
    }

    const key = targetProviderId.toLowerCase();
    const current = this.providerStatuses.get(key) ?? { state: ProviderState.Healthy, consecutiveFailures: 0 };
    const consecutive = current.consecutiveFailures + 1;

    let newState = ProviderState.Healthy;
    if (consecutive >= (this.options.failureThresholdBeforeOffline ?? 5)) {
      newState = ProviderState.Offline;
    } else if (consecutive >= (this.options.failureThresholdBeforeDegraded ?? 3)) {
      newState = ProviderState.Degraded;
    }

    this.providerStatuses.set(key, {
      state: newState,
      consecutiveFailures: consecutive,
      lastHealthCheck: Date.now(),
      lastError: error
    });
  }

  private getSortedAdapters(): IMetadataProviderAdapter[] {
    return Array.from(this.providers.values()).sort((a, b) => (b.priority ?? 100) - (a.priority ?? 100));
  }
}
