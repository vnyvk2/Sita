import { useState, useEffect } from 'react';
import { useAppUpdates } from './useAppUpdates';

export const useSchedulerMetrics = () => {
  const [metrics, setMetrics] = useState<SchedulerMetrics | null>(null);

  // Listen to IPC broadcasts for metric updates first
  useAppUpdates('LIBRARY_SCHEDULER_UPDATE', (data) => {
    if (data?.metrics) {
      setMetrics(data.metrics as SchedulerMetrics);
    }
  });

  useEffect(() => {
    // Then do the initial fetch
    window.api.libraryMetrics.getSchedulerMetrics().then((initialMetrics) => {
      setMetrics(initialMetrics);
    });
  }, []);

  return metrics;
};
