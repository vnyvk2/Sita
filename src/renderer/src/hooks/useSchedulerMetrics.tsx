import { useState, useEffect } from 'react';
export const useSchedulerMetrics = () => {
  const [metrics, setMetrics] = useState<SchedulerMetrics | null>(null);

  useEffect(() => {
    // Listen to IPC broadcasts for metric updates first
    const handleMessage = (_event: unknown, messageCode: string, data: any) => {
      if (messageCode === 'LIBRARY_SCHEDULER_UPDATE' && data?.metrics) {
        setMetrics(data.metrics as SchedulerMetrics);
      }
    };

    window.api.messages.getMessageFromMain(handleMessage);

    // Initial fetch
    window.api.libraryMetrics.getSchedulerMetrics().then((initialMetrics) => {
      setMetrics(initialMetrics);
    });

    return () => {
      window.api.messages.removeMessageToRendererEventListener(handleMessage);
    };
  }, []);

  return metrics;
};
