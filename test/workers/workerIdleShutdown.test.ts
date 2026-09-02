import { EventEmitter } from 'events';

import { utilityProcess } from 'electron';

import { MediaWorkerBridge } from '@main/workers/process/MediaWorkerBridge';
import { MEDIA_WORKER_PROTOCOL_VERSION } from '@main/workers/process/workerProtocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MockChildProcess extends EventEmitter {
  public pid = 4321;
  public postMessage = vi.fn();
  public kill = vi.fn();
}

vi.mock('@main/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}));

const evtReady = {
  protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
  type: 'EVT_READY',
  pid: 4321,
  supportedOps: ['walk', 'parse', 'assets']
};

const evtPong = (ts: number) => ({
  protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
  type: 'EVT_PONG',
  clientTimestamp: ts
});

describe('MediaWorkerBridge idle auto-shutdown', () => {
  let bridge: MediaWorkerBridge;
  let child: MockChildProcess;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    process.env.NORA_WORKER_IDLE_SHUTDOWN_MS = '1';
    bridge = new MediaWorkerBridge();
    child = new MockChildProcess();
    vi.mocked(utilityProcess.fork).mockClear();
    vi.mocked(utilityProcess.fork).mockImplementation(() => child as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.NORA_WORKER_IDLE_SHUTDOWN_MS;
  });

  async function startToReady() {
    const ready = bridge.start();
    await vi.advanceTimersByTimeAsync(0);
    child.emit('message', evtReady);
    await ready;
    expect(bridge.getState()).toBe('READY');
  }

  it('stays READY while protocol traffic keeps flowing', async () => {
    process.env.NORA_WORKER_IDLE_SHUTDOWN_MS = '35000';
    await startToReady();

    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(10_000);
      child.emit('message', evtPong(Date.now()));
      child.postMessage.mockClear();
    }

    expect(bridge.getState()).toBe('READY');
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('shuts down after the idle window and allows a later restart', async () => {
    await startToReady();

    // 1ms idle threshold + 30s check interval → first check should fire it
    await vi.advanceTimersByTimeAsync(31_000);

    // terminate() sends CMD_SHUTDOWN and waits; complete the flow with process exit
    expect(bridge.getState()).toBe('DRAINING');
    child.emit('exit', 0);
    await vi.advanceTimersByTimeAsync(0);

    expect(bridge.getState()).toBe('UNINITIALIZED');

    // A later task can transparently respawn the worker
    const child2 = new MockChildProcess();
    vi.mocked(utilityProcess.fork).mockImplementation(() => child2 as never);
    const ready2 = bridge.start();
    await vi.advanceTimersByTimeAsync(0);
    child2.emit('message', evtReady);
    await ready2;

    expect(bridge.getState()).toBe('READY');
  });

  it('disables the idle shutdown entirely when the env var is 0', async () => {
    process.env.NORA_WORKER_IDLE_SHUTDOWN_MS = '0';
    await startToReady();

    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(bridge.getState()).toBe('READY');
    expect(child.kill).not.toHaveBeenCalled();
  });
});
