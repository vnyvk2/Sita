import { store, dispatch } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useSchedulerMetrics } from '../../hooks/useSchedulerMetrics';
import Button from '../Button';
import ErrorBoundary from '../ErrorBoundary';

const LibraryDiagnosticsPanel = memo(() => {
  const metrics = useSchedulerMetrics();
  const { t } = useTranslation();
  const isOpen = useStore(store, (state) => state.isLibraryDiagnosticsPanelOpen);

  if (!isOpen) return null;

  const closePanel = () => {
    dispatch({ type: 'TOGGLE_LIBRARY_DIAGNOSTICS_PANEL', data: false });
  };

  return (
    <ErrorBoundary>
      <div
        className="absolute inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm transition-opacity sm:items-center"
        onClick={closePanel}
      >
        <div
          className="bg-background-color-1 dark:bg-dark-background-color-1 relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl shadow-2xl sm:w-[480px] sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-background-color-2 dark:border-dark-background-color-2 flex items-center justify-between border-b p-5">
            <h2 className="text-font-color-black dark:text-font-color-white text-xl font-medium">
              {t('diagnostics.library_builder', 'Library Builder Diagnostics')}
            </h2>
            <button
              onClick={closePanel}
              className="hover:bg-background-color-2 dark:hover:bg-dark-background-color-2 material-symbols-rounded rounded-full p-2 transition-colors"
            >
              close
            </button>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto p-5">
            {/* Live Stats */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="Completed" value={metrics?.completedJobs ?? 0} />
              <StatCard label="In Queue" value={metrics?.queuedJobs ?? 0} />
              <StatCard
                label="Failures"
                value={metrics?.failedJobs ?? 0}
                isError={(metrics?.failedJobs ?? 0) > 0}
              />
              <StatCard label="Avg Runtime" value={`${metrics?.averageRuntime ?? 0}ms`} />
            </div>

            {/* Error Center */}
            {(metrics?.failedJobs ?? 0) > 0 && (
              <div className="flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/10 p-4">
                <div>
                  <h3 className="font-medium text-red-500">Failed Jobs Detected</h3>
                  <p className="text-font-color-highlight dark:text-dark-font-color-highlight mt-1 text-xs">
                    Some operations could not be completed.
                  </p>
                </div>
                <Button
                  label="Retry Recoverable"
                  className="bg-red-500 !px-4 !py-2 text-white hover:bg-red-600"
                  clickHandler={() => window.api.libraryMetrics.retryRecoverable()}
                />
              </div>
            )}

            {/* Running Jobs */}
            <div>
              <h3 className="mb-3 text-sm font-medium tracking-wider uppercase opacity-80">
                Active Workers ({metrics?.runningWorkers ?? 0} / {metrics?.maxWorkers ?? 0})
              </h3>
              <div className="space-y-2">
                {metrics?.runningJobsList?.length === 0 ? (
                  <p className="text-sm italic opacity-50">No active workers right now.</p>
                ) : (
                  metrics?.runningJobsList?.map((job) => (
                    <div
                      key={job.id}
                      className="bg-background-color-2/50 dark:bg-dark-background-color-2/50 flex items-center gap-3 rounded-lg p-3"
                    >
                      <span className="material-symbols-rounded text-font-color-highlight animate-spin text-sm">
                        sync
                      </span>
                      <span className="truncate text-sm" title={job.description}>
                        {job.description}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Event Timeline */}
            <div>
              <h3 className="mb-3 text-sm font-medium tracking-wider uppercase opacity-80">
                Event Timeline
              </h3>
              <div className="bg-background-color-2/30 dark:bg-dark-background-color-2/30 max-h-48 space-y-3 overflow-y-auto rounded-xl p-4">
                {metrics?.timeline && metrics.timeline.length > 0 ? (
                  [...metrics.timeline].reverse().map((event, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      <span className="text-font-color-highlight dark:text-dark-font-color-highlight mt-0.5 shrink-0 text-xs">
                        {new Date(event.timestamp).toLocaleTimeString([], { hour12: false })}
                      </span>
                      <span className="opacity-90">{event.message}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm italic opacity-50">Waiting for events...</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
});

const StatCard = ({
  label,
  value,
  isError = false
}: {
  label: string;
  value: string | number;
  isError?: boolean;
}) => (
  <div className="bg-background-color-2/50 dark:bg-dark-background-color-2/50 flex flex-col items-center justify-center rounded-xl p-3 text-center">
    <span
      className={`text-2xl font-light ${isError ? 'text-red-500' : 'text-font-color-black dark:text-font-color-white'}`}
    >
      {value}
    </span>
    <span className="text-font-color-highlight dark:text-dark-font-color-highlight mt-1 text-xs tracking-wider uppercase">
      {label}
    </span>
  </div>
);

LibraryDiagnosticsPanel.displayName = 'LibraryDiagnosticsPanel';
export default LibraryDiagnosticsPanel;
