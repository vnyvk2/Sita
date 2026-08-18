import { describe, expect, it, vi } from 'vitest';
import { MetadataEventBus } from '@main/metadata/events/MetadataEventBus';
import { ProviderCircuitBreaker } from '@main/metadata/providers/circuitbreaker/ProviderCircuitBreaker';

describe('ProviderCircuitBreaker (Phase 2 State Machine & HalfOpen Probes)', () => {
  it('opens circuit when failure threshold is reached', () => {
    const eventBus = new MetadataEventBus();
    const breaker = new ProviderCircuitBreaker('test-provider', eventBus, {
      failureThreshold: 3,
      cooldownMs: 5000
    });

    expect(breaker.getState()).toBe('Closed');
    expect(breaker.isCallAllowed()).toBe(true);

    breaker.onFailure('Network error 1');
    expect(breaker.getState()).toBe('Closed');
    expect(breaker.getFailureCount()).toBe(1);

    breaker.onFailure('Network error 2');
    expect(breaker.getState()).toBe('Closed');
    expect(breaker.getFailureCount()).toBe(2);

    breaker.onFailure('Network error 3');
    expect(breaker.getState()).toBe('Open');
    expect(breaker.isCallAllowed()).toBe(false);
  });

  it('transitions from Open to HalfOpen when cooldown expires and admits only 1 probe', () => {
    vi.useFakeTimers();
    try {
      const eventBus = new MetadataEventBus();
      const breaker = new ProviderCircuitBreaker('test-provider', eventBus, {
        failureThreshold: 2,
        cooldownMs: 5000,
        successThreshold: 2
      });

      breaker.onFailure('Err 1');
      breaker.onFailure('Err 2');
      expect(breaker.getState()).toBe('Open');
      expect(breaker.isCallAllowed()).toBe(false);

      // Advance time past cooldown
      vi.advanceTimersByTime(5001);

      expect(breaker.getState()).toBe('HalfOpen');
      expect(breaker.isCallAllowed()).toBe(true);

      // Record first probe start
      breaker.recordProbeStart();

      // Second probe must be denied while first probe is active
      expect(breaker.isCallAllowed()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('requires successThreshold consecutive successes to transition HalfOpen -> Closed', () => {
    vi.useFakeTimers();
    try {
      const eventBus = new MetadataEventBus();
      const breaker = new ProviderCircuitBreaker('test-provider', eventBus, {
        failureThreshold: 1,
        cooldownMs: 2000,
        successThreshold: 2
      });

      breaker.onFailure('Trip');
      expect(breaker.getState()).toBe('Open');

      vi.advanceTimersByTime(2001);
      expect(breaker.getState()).toBe('HalfOpen');

      // Success #1: must remain HalfOpen
      breaker.recordProbeStart();
      breaker.onSuccess();
      expect(breaker.getState()).toBe('HalfOpen');
      expect(breaker.getConsecutiveSuccesses()).toBe(1);
      expect(breaker.isCallAllowed()).toBe(true);

      // Success #2: reaches threshold -> transitions to Closed
      breaker.recordProbeStart();
      breaker.onSuccess();
      expect(breaker.getState()).toBe('Closed');
      expect(breaker.getConsecutiveSuccesses()).toBe(0);
      expect(breaker.getFailureCount()).toBe(0);
      expect(breaker.isCallAllowed()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('immediately reopens circuit on a single failure in HalfOpen state', () => {
    vi.useFakeTimers();
    try {
      const eventBus = new MetadataEventBus();
      const breaker = new ProviderCircuitBreaker('test-provider', eventBus, {
        failureThreshold: 5,
        cooldownMs: 3000,
        successThreshold: 2
      });

      // Trip to open
      for (let i = 0; i < 5; i++) breaker.onFailure('Trip');
      expect(breaker.getState()).toBe('Open');

      vi.advanceTimersByTime(3001);
      expect(breaker.getState()).toBe('HalfOpen');

      // Failure in HalfOpen immediately trips back to Open
      breaker.recordProbeStart();
      breaker.onFailure('Probe failed');
      expect(breaker.getState()).toBe('Open');
      expect(breaker.isCallAllowed()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores stale success completions when breaker is Open without resetting failureCount', () => {
    const eventBus = new MetadataEventBus();
    const breaker = new ProviderCircuitBreaker('test-provider', eventBus, {
      failureThreshold: 2,
      cooldownMs: 10000
    });

    breaker.onFailure('Err 1');
    breaker.onFailure('Err 2');
    expect(breaker.getState()).toBe('Open');
    expect(breaker.getFailureCount()).toBe(2);

    // Stale success returns while Open
    breaker.onSuccess();
    expect(breaker.getState()).toBe('Open');
    expect(breaker.getFailureCount()).toBe(2);
  });
});
