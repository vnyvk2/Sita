import type { MetadataEventBus } from '../../events/MetadataEventBus';

export type CircuitBreakerState = 'Closed' | 'Open' | 'HalfOpen';

export interface ProviderCircuitBreakerOptions {
  failureThreshold?: number;
  successThreshold?: number;
  cooldownMs?: number;
}

export class ProviderCircuitBreaker {
  private readonly providerId: string;
  private readonly eventBus: MetadataEventBus;
  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly cooldownMs: number;

  private state: CircuitBreakerState = 'Closed';
  private failureCount: number = 0;
  private consecutiveSuccesses: number = 0;
  private isProbeActive: boolean = false;
  private nextAttemptAt: number = 0;

  constructor(
    providerId: string,
    eventBus: MetadataEventBus,
    options: ProviderCircuitBreakerOptions = {}
  ) {
    this.providerId = providerId;
    this.eventBus = eventBus;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.successThreshold = options.successThreshold ?? 2;
    this.cooldownMs = options.cooldownMs ?? 30000;
  }

  public getState(): CircuitBreakerState {
    if (this.state === 'Open' && Date.now() >= this.nextAttemptAt) {
      this.state = 'HalfOpen';
      this.consecutiveSuccesses = 0;
      this.isProbeActive = false;
    }
    return this.state;
  }

  public isCallAllowed(): boolean {
    const currentState = this.getState();
    if (currentState === 'Closed') return true;
    if (currentState === 'HalfOpen') {
      return !this.isProbeActive;
    }
    return false;
  }

  public recordProbeStart(): void {
    if (this.getState() === 'HalfOpen') {
      this.isProbeActive = true;
    }
  }

  public onSuccess(): void {
    const currentState = this.getState();
    if (currentState === 'HalfOpen') {
      this.isProbeActive = false;
      this.consecutiveSuccesses++;
      if (this.consecutiveSuccesses >= this.successThreshold) {
        this.state = 'Closed';
        this.failureCount = 0;
        this.consecutiveSuccesses = 0;
        this.eventBus.emit('ProviderCircuitClosed', {
          providerId: this.providerId,
          state: 'Closed',
          reason: `Provider recovered: ${this.successThreshold} consecutive successes in HalfOpen state`
        });
      }
    } else if (currentState === 'Closed') {
      this.failureCount = 0;
    }
    // If state is Open, ignore stale success without resetting failureCount
  }

  public onFailure(reason?: string): void {
    const currentState = this.getState();
    if (currentState === 'HalfOpen') {
      this.isProbeActive = false;
      this.consecutiveSuccesses = 0;
      this.state = 'Open';
      this.nextAttemptAt = Date.now() + this.cooldownMs;
      this.eventBus.emit('ProviderCircuitOpened', {
        providerId: this.providerId,
        state: 'Open',
        reason: reason ?? 'Probe failed in HalfOpen state'
      });
    } else if (currentState === 'Closed') {
      this.failureCount++;
      if (this.failureCount >= this.failureThreshold) {
        this.state = 'Open';
        this.nextAttemptAt = Date.now() + this.cooldownMs;
        this.eventBus.emit('ProviderCircuitOpened', {
          providerId: this.providerId,
          state: 'Open',
          reason: reason ?? `Failure threshold (${this.failureThreshold}) reached`
        });
      }
    }
  }

  public getFailureCount(): number {
    return this.failureCount;
  }

  public getConsecutiveSuccesses(): number {
    return this.consecutiveSuccesses;
  }
}
