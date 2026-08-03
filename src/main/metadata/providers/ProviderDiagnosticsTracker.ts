import type { MetadataEventBus } from '../events/MetadataEventBus';

export interface ProviderMetrics {
  providerId: string;
  requestCount: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  skippedCount: number;
  lastLatencyMs: number;
  totalLatencyMs: number;
  averageLatencyMs: number;
  lastFailureAt?: Date;
  lastSuccessAt?: Date;
  consecutiveFailures: number;
}

export class ProviderDiagnosticsTracker {
  private readonly metricsMap: Map<string, ProviderMetrics> = new Map();

  constructor(eventBus: MetadataEventBus) {
    this.subscribeToEvents(eventBus);
  }

  public getMetrics(providerId: string): ProviderMetrics | undefined {
    return this.metricsMap.get(providerId);
  }

  public getAllMetrics(): ProviderMetrics[] {
    return Array.from(this.metricsMap.values());
  }

  private subscribeToEvents(eventBus: MetadataEventBus): void {
    eventBus.on('ProviderStarted', (event) => {
      const metrics = this.getOrCreateMetrics(event.providerInfo.id);
      metrics.requestCount++;
    });

    eventBus.on('ProviderCompleted', (event) => {
      const metrics = this.getOrCreateMetrics(event.providerInfo.id);
      metrics.successCount++;
      metrics.lastLatencyMs = event.latencyMs;
      metrics.totalLatencyMs += event.latencyMs;
      metrics.averageLatencyMs = metrics.totalLatencyMs / (metrics.successCount || 1);
      metrics.lastSuccessAt = new Date();
      metrics.consecutiveFailures = 0;
    });

    eventBus.on('ProviderFailed', (event) => {
      const metrics = this.getOrCreateMetrics(event.providerInfo.id);
      metrics.failureCount++;
      metrics.lastLatencyMs = event.latencyMs;
      metrics.lastFailureAt = new Date();
      metrics.consecutiveFailures++;
    });

    eventBus.on('ProviderTimeout', (event) => {
      const metrics = this.getOrCreateMetrics(event.providerInfo.id);
      metrics.timeoutCount++;
      metrics.lastLatencyMs = event.latencyMs;
      metrics.lastFailureAt = new Date();
      metrics.consecutiveFailures++;
    });

    eventBus.on('ProviderSkipped', (event) => {
      const metrics = this.getOrCreateMetrics(event.providerInfo.id);
      metrics.skippedCount++;
    });
  }

  private getOrCreateMetrics(providerId: string): ProviderMetrics {
    let metrics = this.metricsMap.get(providerId);
    if (!metrics) {
      metrics = {
        providerId,
        requestCount: 0,
        successCount: 0,
        failureCount: 0,
        timeoutCount: 0,
        skippedCount: 0,
        lastLatencyMs: 0,
        totalLatencyMs: 0,
        averageLatencyMs: 0,
        consecutiveFailures: 0
      };
      this.metricsMap.set(providerId, metrics);
    }
    return metrics;
  }
}
