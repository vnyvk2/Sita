import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initEventLoopMonitor, stopEventLoopMonitor } from '../../../../src/main/utils/eventLoopMonitor';

describe('eventLoopMonitor', () => {
  const originalEnv = process.env.NORA_PERF_MONITOR;
  const originalArgv = [...process.argv];

  beforeEach(() => {
    stopEventLoopMonitor();
    delete process.env.NORA_PERF_MONITOR;
    process.argv = process.argv.filter((arg) => arg !== '--perf-monitor');
  });

  afterEach(() => {
    stopEventLoopMonitor();
    if (originalEnv !== undefined) {
      process.env.NORA_PERF_MONITOR = originalEnv;
    } else {
      delete process.env.NORA_PERF_MONITOR;
    }
    process.argv = [...originalArgv];
  });

  it('returns null when monitoring is not enabled', () => {
    const monitor = initEventLoopMonitor();
    expect(monitor).toBeNull();
  });

  it('initializes and enables monitor when NORA_PERF_MONITOR="1"', () => {
    process.env.NORA_PERF_MONITOR = '1';
    const monitor = initEventLoopMonitor();
    expect(monitor).not.toBeNull();
    stopEventLoopMonitor();
  });

  it('initializes and enables monitor when --perf-monitor CLI flag is passed', () => {
    process.argv.push('--perf-monitor');
    const monitor = initEventLoopMonitor();
    expect(monitor).not.toBeNull();
    stopEventLoopMonitor();
  });
});
