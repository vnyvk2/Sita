import type { MetadataEventBus } from '../../events/MetadataEventBus';
import type { MetadataProviderConfig } from '../config/MetadataProviderConfig';

import { ProviderCircuitBreaker } from './ProviderCircuitBreaker';

export class ProviderCircuitBreakerRegistry {
  private readonly breakers: Map<string, ProviderCircuitBreaker> = new Map();
  private readonly eventBus: MetadataEventBus;

  constructor(eventBus: MetadataEventBus) {
    this.eventBus = eventBus;
  }

  public getOrCreate(providerId: string, config?: MetadataProviderConfig): ProviderCircuitBreaker {
    let breaker = this.breakers.get(providerId);
    if (!breaker) {
      breaker = new ProviderCircuitBreaker(providerId, this.eventBus, {
        failureThreshold: config?.circuitBreakerFailureThreshold,
        cooldownMs: config?.circuitBreakerCooldownMs
      });
      this.breakers.set(providerId, breaker);
    }
    return breaker;
  }

  public get(providerId: string): ProviderCircuitBreaker | undefined {
    return this.breakers.get(providerId);
  }
}
