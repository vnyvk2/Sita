import { monitorEventLoopDelay } from 'node:perf_hooks';
import logger from '../logger';

type EventLoopDelayMonitor = ReturnType<typeof monitorEventLoopDelay>;

let monitor: EventLoopDelayMonitor | null = null;
let timer: NodeJS.Timeout | null = null;

export function initEventLoopMonitor(): EventLoopDelayMonitor | null {
  const isEnabled =
    process.env.NORA_PERF_MONITOR === '1' || process.argv.includes('--perf-monitor');

  if (!isEnabled) {
    return null;
  }

  try {
    monitor = monitorEventLoopDelay({ resolution: 20 });
    monitor.enable();

    // Log event loop delay stats periodically
    timer = setInterval(() => {
      if (!monitor) return;
      const min = Math.round(monitor.min / 1e6);
      const mean = Math.round(monitor.mean / 1e6);
      const p50 = Math.round(monitor.percentile(50) / 1e6);
      const p90 = Math.round(monitor.percentile(90) / 1e6);
      const p99 = Math.round(monitor.percentile(99) / 1e6);
      const max = Math.round(monitor.max / 1e6);

      logger.info(
        `[EventLoopDelay] min=${min}ms mean=${mean}ms p50=${p50}ms p90=${p90}ms p99=${p99}ms max=${max}ms`
      );
      monitor.reset();
    }, 5000);

    timer.unref();
    logger.info('[EventLoopDelay] Monitoring active (resolution: 20ms)');
    return monitor;
  } catch (err) {
    logger.warn('[EventLoopDelay] Failed to initialize monitorEventLoopDelay', { err });
    return null;
  }
}

export function stopEventLoopMonitor(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (monitor) {
    monitor.disable();
    monitor = null;
  }
}
