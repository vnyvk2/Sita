import type { MetadataEventBus } from '../../events/MetadataEventBus';

export type CircuitBreakerState = 'Closed' | 'Open' | 'HalfOpen';

export interface ProviderCircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
}

export class ProviderCircuitBreaker {
  private readonly providerId: string;
  private readonly eventBus: MetadataEventBus;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;

  private state: CircuitBreakerState = 'Closed';
  private failureCount: number = 0;
  private nextAttemptAt: number = 0;

  constructor(
    providerId: string,
    eventBus: MetadataEventBus,
    options: ProviderCircuitBreakerOptions = {}
  ) {
    this.providerId = providerId;
    this.eventBus = eventBus;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.cooldownMs = options.cooldownMs ?? 30000;
  }

  public getState(): CircuitBreakerState {
    if (this.state === 'Open' && Date.now() >= this.nextAttemptAt) {
      this.state = 'HalfOpen';
    }
    return this.state;
  }

  public isCallAllowed(): boolean {
    const currentState = this.getState();
    return currentState === 'Closed' || currentState === 'HalfOpen';
  }

  public onSuccess(): void {
    if (this.state === 'HalfOpen' || this.state === 'Open') {
      this.state = 'Closed';
      this.failureCount = 0;
      this.eventBus.emit('ProviderCircuitClosed', {
        providerId: this.providerId,
        state: 'Closed',
        reason: 'Provider call succeeded in HalfOpen state'
      });
    } else {
      this.failureCount = 0;
    }
  }

  public onFailure(reason?: string): void {
    this.failureCount++;
    if (this.state === 'HalfOpen' || this.failureCount >= this.failureThreshold) {
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
