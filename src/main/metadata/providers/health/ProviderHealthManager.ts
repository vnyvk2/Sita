import type { MetadataEventBus } from '../../events/MetadataEventBus';
import { ProviderHealth } from './ProviderHealth';

interface MutableHealthData {
  providerId: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
  latencies: number[];
  startTime: number;
  lastOutageAt?: Date;
  lastRecoveryAt?: Date;
  lastSeenAt?: Date;
  lastSuccessfulRequestAt?: Date;
  lastFailedRequestAt?: Date;
  currentState: 'Online' | 'Offline' | 'Degraded';
  cachedHealth?: ProviderHealth;
}

export class ProviderHealthManager {
  private readonly healthMap: Map<string, MutableHealthData> = new Map();
  private readonly eventBus: MetadataEventBus;

  constructor(eventBus: MetadataEventBus) {
    this.eventBus = eventBus;
    this.subscribeToEvents();
  }

  public getHealth(providerId: string): ProviderHealth | undefined {
    const data = this.healthMap.get(providerId);
    if (!data) return undefined;

    if (!data.cachedHealth) {
      data.cachedHealth = this.calculateHealth(data);
    }
    return data.cachedHealth;
  }

  private calculateHealth(data: MutableHealthData): ProviderHealth {
    const availabilityPercent =
      data.totalRequests === 0
        ? 100
        : Math.round((data.successfulRequests / data.totalRequests) * 100);

    const meanLatencyMs =
      data.latencies.length === 0
        ? 0
        : Math.round(data.latencies.reduce((a, b) => a + b, 0) / data.latencies.length);

    const sortedLatencies = [...data.latencies].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const p95LatencyMs = sortedLatencies.length === 0 ? 0 : (sortedLatencies[p95Index] ?? 0);

    return new ProviderHealth({
      providerId: data.providerId,
      availabilityPercent,
      isDegraded: data.currentState === 'Degraded',
      consecutiveSuccesses: data.consecutiveSuccesses,
      consecutiveFailures: data.consecutiveFailures,
      meanLatencyMs,
      p95LatencyMs,
      uptimeMs: Date.now() - data.startTime,
      lastOutageAt: data.lastOutageAt,
      lastRecoveryAt: data.lastRecoveryAt,
      lastSeenAt: data.lastSeenAt,
      lastSuccessfulRequestAt: data.lastSuccessfulRequestAt,
      lastFailedRequestAt: data.lastFailedRequestAt
    });
  }

  private invalidateCache(data: MutableHealthData): void {
    data.cachedHealth = undefined;
  }

  private subscribeToEvents(): void {
    this.eventBus.on('ProviderStarted', (event) => {
      const data = this.getOrCreateData(event.providerInfo.id);
      data.totalRequests++;
      data.lastSeenAt = new Date();
      this.invalidateCache(data);
    });

    this.eventBus.on('ProviderCompleted', (event) => {
      const data = this.getOrCreateData(event.providerInfo.id);
      data.successfulRequests++;
      data.consecutiveSuccesses++;
      data.consecutiveFailures = 0;
      data.lastSeenAt = new Date();
      data.lastSuccessfulRequestAt = new Date();

      if (event.latencyMs > 0) {
        data.latencies.push(event.latencyMs);
        if (data.latencies.length > 100) data.latencies.shift();
      }

      if (data.currentState === 'Offline' || data.currentState === 'Degraded') {
        const previousState = data.currentState;
        data.currentState = 'Online';
        data.lastRecoveryAt = new Date();
        this.eventBus.emit('ProviderRecovered', {
          providerId: event.providerInfo.id,
          previousState,
          currentState: 'Online',
          timestamp: new Date()
        });
      }
      this.invalidateCache(data);
    });

    this.eventBus.on('ProviderFailed', (event) => {
      this.handleFailure(event.providerInfo.id, event.latencyMs, event.error);
    });

    this.eventBus.on('ProviderTimeout', (event) => {
      this.handleFailure(event.providerInfo.id, event.latencyMs, event.error ?? 'Timeout');
    });

    this.eventBus.on('ProviderCircuitOpened', (event) => {
      const data = this.getOrCreateData(event.providerId);
      const previousState = data.currentState;
      data.currentState = 'Offline';
      data.lastOutageAt = new Date();

      this.eventBus.emit('ProviderOffline', {
        providerId: event.providerId,
        previousState,
        currentState: 'Offline',
        reason: event.reason ?? 'Circuit breaker opened',
        timestamp: new Date()
      });
      this.invalidateCache(data);
    });
  }

  private handleFailure(providerId: string, latencyMs: number, error?: string): void {
    const data = this.getOrCreateData(providerId);
    data.failedRequests++;
    data.consecutiveFailures++;
    data.consecutiveSuccesses = 0;
    data.lastSeenAt = new Date();
    data.lastFailedRequestAt = new Date();

    if (latencyMs > 0) {
      data.latencies.push(latencyMs);
      if (data.latencies.length > 100) data.latencies.shift();
    }

    if (data.consecutiveFailures >= 3 && data.currentState === 'Online') {
      data.currentState = 'Degraded';
      this.eventBus.emit('ProviderDegraded', {
        providerId,
        previousState: 'Online',
        currentState: 'Degraded',
        reason: error ?? 'High consecutive failures',
        timestamp: new Date()
      });
    }
    this.invalidateCache(data);
  }

  private getOrCreateData(providerId: string): MutableHealthData {
    let data = this.healthMap.get(providerId);
    if (!data) {
      data = {
        providerId,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        latencies: [],
        startTime: Date.now(),
        currentState: 'Online'
      };
      this.healthMap.set(providerId, data);
    }
    return data;
  }
}
