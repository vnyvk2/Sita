export interface ProviderHealthOptions {
  providerId: string;
  availabilityPercent?: number;
  isDegraded?: boolean;
  consecutiveSuccesses?: number;
  consecutiveFailures?: number;
  meanLatencyMs?: number;
  p95LatencyMs?: number;
  uptimeMs?: number;
  lastOutageAt?: Date;
  lastRecoveryAt?: Date;
  lastSeenAt?: Date;
  lastSuccessfulRequestAt?: Date;
  lastFailedRequestAt?: Date;
}

export class ProviderHealth {
  public readonly providerId: string;
  public readonly availabilityPercent: number;
  public readonly isDegraded: boolean;
  public readonly consecutiveSuccesses: number;
  public readonly consecutiveFailures: number;
  public readonly meanLatencyMs: number;
  public readonly p95LatencyMs: number;
  public readonly uptimeMs: number;
  public readonly lastOutageAt?: Date;
  public readonly lastRecoveryAt?: Date;
  public readonly lastSeenAt?: Date;
  public readonly lastSuccessfulRequestAt?: Date;
  public readonly lastFailedRequestAt?: Date;

  constructor(options: ProviderHealthOptions) {
    this.providerId = options.providerId;
    this.availabilityPercent = options.availabilityPercent ?? 100;
    this.isDegraded = options.isDegraded ?? false;
    this.consecutiveSuccesses = options.consecutiveSuccesses ?? 0;
    this.consecutiveFailures = options.consecutiveFailures ?? 0;
    this.meanLatencyMs = options.meanLatencyMs ?? 0;
    this.p95LatencyMs = options.p95LatencyMs ?? 0;
    this.uptimeMs = options.uptimeMs ?? 0;
    this.lastOutageAt = options.lastOutageAt;
    this.lastRecoveryAt = options.lastRecoveryAt;
    this.lastSeenAt = options.lastSeenAt;
    this.lastSuccessfulRequestAt = options.lastSuccessfulRequestAt;
    this.lastFailedRequestAt = options.lastFailedRequestAt;
  }
}
