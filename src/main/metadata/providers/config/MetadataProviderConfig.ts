export interface MetadataProviderConfigOptions {
  timeoutMs?: number;
  enabled?: boolean;
  priority?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  backoffMultiplier?: number;
  circuitBreakerFailureThreshold?: number;
  circuitBreakerCooldownMs?: number;
}

export class MetadataProviderConfig {
  public readonly timeoutMs: number;
  public readonly enabled: boolean;
  public readonly priority: number;
  public readonly maxRetries: number;
  public readonly baseDelayMs: number;
  public readonly backoffMultiplier: number;
  public readonly circuitBreakerFailureThreshold: number;
  public readonly circuitBreakerCooldownMs: number;

  constructor(options: MetadataProviderConfigOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.enabled = options.enabled ?? true;
    this.priority = options.priority ?? 50;
    this.maxRetries = options.maxRetries ?? 2;
    this.baseDelayMs = options.baseDelayMs ?? 200;
    this.backoffMultiplier = options.backoffMultiplier ?? 2;
    this.circuitBreakerFailureThreshold = options.circuitBreakerFailureThreshold ?? 5;
    this.circuitBreakerCooldownMs = options.circuitBreakerCooldownMs ?? 30000;
  }
}
