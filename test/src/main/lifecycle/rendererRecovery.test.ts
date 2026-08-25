import { attachRendererRecovery } from '@main/lifecycle/rendererRecovery';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/main/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn()
  }
}));

const RELOAD_DELAY_MS = 250;

type PlayerType = 'normal' | 'mini' | 'full';

interface ListenerRecord {
  event: string;
  callback: (...args: unknown[]) => void;
}

class FakeWebContents {
  public listeners: ListenerRecord[] = [];
  public destroyed = false;
  public reload = vi.fn();

  on(event: string, callback: (...args: unknown[]) => void) {
    this.listeners.push({ event, callback });
  }

  removeListener(event: string, callback: (...args: unknown[]) => void) {
    this.listeners = this.listeners.filter(
      (record) => !(record.event === event && record.callback === callback)
    );
  }

  isDestroyed() {
    return this.destroyed;
  }

  emit(event: string, ...args: unknown[]) {
    for (const record of [...this.listeners]) {
      if (record.event === event) record.callback(...args);
    }
  }
}

const createDeps = (playerType: PlayerType = 'mini') => {
  const deps = {
    playerType,
    operationOrder: [] as string[],
    getPlayerType: vi.fn(() => {
      deps.operationOrder.push('getPlayerType');
      return deps.playerType;
    }),
    onRecovered: vi.fn(() => {
      deps.operationOrder.push('onRecovered');
    }),
    onRecoveryLimitExceeded: vi.fn()
  };
  return deps;
};

/** Emits a crash and flushes the deferred reload timer deterministically. */
async function crashRenderer(webContents: FakeWebContents) {
  webContents.emit('render-process-gone', null, { reason: 'crashed', exitCode: -1 });
  await vi.advanceTimersByTimeAsync(RELOAD_DELAY_MS);
}

describe('attachRendererRecovery', () => {
  let webContents: FakeWebContents;

  beforeEach(() => {
    webContents = new FakeWebContents();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('clean exits', () => {
    it('does not reload when the renderer exited cleanly', async () => {
      const deps = createDeps();
      attachRendererRecovery(webContents as never, deps);

      webContents.emit('render-process-gone', null, { reason: 'clean-exit', exitCode: 0 });
      await vi.advanceTimersByTimeAsync(RELOAD_DELAY_MS);

      expect(webContents.reload).not.toHaveBeenCalled();
      expect(deps.onRecovered).not.toHaveBeenCalled();
      expect(deps.onRecoveryLimitExceeded).not.toHaveBeenCalled();
    });
  });

  describe('single crash recovery', () => {
    it('reloads after a deferred tick and captures the pre-crash player type BEFORE reloading', async () => {
      const deps = createDeps('mini');
      attachRendererRecovery(webContents as never, deps);

      await crashRenderer(webContents);

      expect(webContents.reload).toHaveBeenCalledTimes(1);
      // The pre-crash presentation state must be read before reload is invoked.
      expect(deps.operationOrder).toEqual(['getPlayerType']);
    });

    it('does not reload synchronously inside the render-process-gone handler', () => {
      const deps = createDeps('mini');
      attachRendererRecovery(webContents as never, deps);

      // A synchronous reload here takes down the whole process tree
      // (verified empirically); it must be deferred.
      webContents.emit('render-process-gone', null, { reason: 'crashed', exitCode: -1 });
      expect(webContents.reload).not.toHaveBeenCalled();
    });

    it('invokes onRecovered exactly once with the pre-crash player type after reload finishes', async () => {
      const deps = createDeps('mini');
      attachRendererRecovery(webContents as never, deps);

      await crashRenderer(webContents);
      webContents.emit('did-finish-load');

      expect(deps.onRecovered).toHaveBeenCalledTimes(1);
      expect(deps.onRecovered).toHaveBeenCalledWith('mini');
    });

    it('ignores did-finish-load events that are unrelated to a crash recovery', async () => {
      const deps = createDeps('normal');
      attachRendererRecovery(webContents as never, deps);

      // Initial boot load — no crash preceded it.
      webContents.emit('did-finish-load');

      expect(deps.onRecovered).not.toHaveBeenCalled();
    });
  });

  describe('crash-loop rate limiting', () => {
    it('reloads for the first three crashes then refuses further reloads and reports exhaustion', async () => {
      const deps = createDeps('mini');
      attachRendererRecovery(webContents as never, deps);

      // A rapid boot-crash loop: each reload completes but the renderer
      // crashes again before proving stable.
      for (let crash = 1; crash <= 3; crash += 1) {
        await crashRenderer(webContents);
        expect(webContents.reload).toHaveBeenCalledTimes(crash);
        webContents.emit('did-finish-load');
      }

      // Crash #4 exceeds the budget: no additional reload.
      await crashRenderer(webContents);
      expect(webContents.reload).toHaveBeenCalledTimes(3);
      expect(deps.onRecoveryLimitExceeded).toHaveBeenCalledTimes(1);
      expect(deps.onRecoveryLimitExceeded).toHaveBeenCalledWith({
        reason: 'crashed',
        exitCode: -1
      });
      // An exhausted budget must not schedule another restore.
      webContents.emit('did-finish-load');
      expect(deps.onRecovered).toHaveBeenCalledTimes(3);
    });

    it('resets the crash budget only after a recovered renderer stays healthy, so isolated crashes never exhaust it', async () => {
      const deps = createDeps('mini');
      const healthyMs = 1_000;
      attachRendererRecovery(webContents as never, deps, { healthyMs });

      // Three crash→recover cycles, each given enough time to prove
      // stability; a non-resetting counter would exhaust here.
      for (let cycle = 0; cycle < 3; cycle += 1) {
        await crashRenderer(webContents);
        webContents.emit('did-finish-load');
        await vi.advanceTimersByTimeAsync(healthyMs);
      }

      expect(webContents.reload).toHaveBeenCalledTimes(3);
      expect(deps.onRecovered).toHaveBeenCalledTimes(3);
      expect(deps.onRecoveryLimitExceeded).not.toHaveBeenCalled();

      // Still within budget after three recovered-and-stable cycles.
      await crashRenderer(webContents);
      expect(webContents.reload).toHaveBeenCalledTimes(4);
    });

    it('does not reset the crash budget when the renderer crashes again before proving stable', async () => {
      const deps = createDeps('mini');
      attachRendererRecovery(webContents as never, deps);

      // Same rapid loop as the exhaustion test: completing a load is not
      // sufficient to reset the budget without a stability period.
      for (let crash = 1; crash <= 3; crash += 1) {
        await crashRenderer(webContents);
        webContents.emit('did-finish-load');
      }
      await crashRenderer(webContents);

      expect(deps.onRecoveryLimitExceeded).toHaveBeenCalledTimes(1);
      expect(webContents.reload).toHaveBeenCalledTimes(3);
    });

    it('allows recoveries again once the rate-limit window has elapsed without any successful recovery', async () => {
      const deps = createDeps('mini');
      attachRendererRecovery(webContents as never, deps, {
        maxRecoveries: 2,
        windowMs: 60_000
      });

      await crashRenderer(webContents);
      await crashRenderer(webContents);
      expect(webContents.reload).toHaveBeenCalledTimes(2);

      await crashRenderer(webContents);
      expect(webContents.reload).toHaveBeenCalledTimes(2);
      expect(deps.onRecoveryLimitExceeded).toHaveBeenCalledTimes(1);

      // No did-finish-load ever arrives; the rolling window alone must
      // eventually restore the budget.
      await vi.advanceTimersByTimeAsync(60_001);
      await crashRenderer(webContents);
      expect(webContents.reload).toHaveBeenCalledTimes(3);
      expect(deps.onRecoveryLimitExceeded).toHaveBeenCalledTimes(1);
    });
  });

  describe('overlapping crashes', () => {
    it('lets only the latest crash drive the post-reload restore, with a single stale-free callback', async () => {
      const deps = createDeps('mini');
      attachRendererRecovery(webContents as never, deps);

      // Crash A begins recovery...
      await crashRenderer(webContents);
      // ...but Crash B occurs before A's reload finishes loading.
      deps.playerType = 'full';
      await crashRenderer(webContents);

      expect(webContents.reload).toHaveBeenCalledTimes(2);

      // A single did-finish-load consumes only the latest generation.
      webContents.emit('did-finish-load');
      expect(deps.onRecovered).toHaveBeenCalledTimes(1);
      expect(deps.onRecovered).toHaveBeenCalledWith('full');

      // A late second did-finish-load (e.g. straggler from reload A) must
      // not fire another stale restore.
      webContents.emit('did-finish-load');
      expect(deps.onRecovered).toHaveBeenCalledTimes(1);
    });
  });

  describe('listener lifecycle', () => {
    it('stops recovering after the returned detach function is called', async () => {
      const deps = createDeps('mini');
      const detach = attachRendererRecovery(webContents as never, deps);

      detach();

      await crashRenderer(webContents);
      webContents.emit('did-finish-load');

      expect(webContents.reload).not.toHaveBeenCalled();
      expect(deps.onRecovered).not.toHaveBeenCalled();
    });
  });
});
