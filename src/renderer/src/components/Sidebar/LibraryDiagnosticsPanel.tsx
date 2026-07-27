import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSchedulerMetrics } from '../../hooks/useSchedulerMetrics';
import ErrorBoundary from '../ErrorBoundary';
import Button from '../Button';

import { store, dispatch } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';

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
      <div className="absolute inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity"
           onClick={closePanel}>
        <div 
          className="relative flex flex-col bg-background-color-1 dark:bg-dark-background-color-1 w-full sm:w-[480px] max-h-[85vh] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-background-color-2 dark:border-dark-background-color-2">
            <h2 className="text-xl font-medium text-font-color-black dark:text-font-color-white">
              {t('diagnostics.library_builder', 'Library Builder Diagnostics')}
            </h2>
            <button 
              onClick={closePanel}
              className="p-2 rounded-full hover:bg-background-color-2 dark:hover:bg-dark-background-color-2 transition-colors material-symbols-rounded"
            >
              close
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            
            {/* Live Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Completed" value={metrics?.completedJobs ?? 0} />
              <StatCard label="In Queue" value={metrics?.queuedJobs ?? 0} />
              <StatCard label="Failures" value={metrics?.failedJobs ?? 0} isError={(metrics?.failedJobs ?? 0) > 0} />
              <StatCard label="Avg Runtime" value={`${metrics?.averageRuntime ?? 0}ms`} />
            </div>

            {/* Error Center */}
            {(metrics?.failedJobs ?? 0) > 0 && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <h3 className="text-red-500 font-medium">Failed Jobs Detected</h3>
                  <p className="text-xs text-font-color-highlight dark:text-dark-font-color-highlight mt-1">
                    Some operations could not be completed.
                  </p>
                </div>
                <Button
                  label="Retry Recoverable"
                  className="bg-red-500 hover:bg-red-600 text-white !py-2 !px-4"
                  onClick={() => window.api.libraryMetrics.retryRecoverable()}
                />
              </div>
            )}

            {/* Running Jobs */}
            <div>
              <h3 className="text-sm font-medium mb-3 opacity-80 uppercase tracking-wider">
                Active Workers ({metrics?.runningWorkers ?? 0} / {metrics?.maxWorkers ?? 0})
              </h3>
              <div className="space-y-2">
                {metrics?.runningJobsList?.length === 0 ? (
                  <p className="text-sm opacity-50 italic">No active workers right now.</p>
                ) : (
                  metrics?.runningJobsList?.map(job => (
                    <div key={job.id} className="flex items-center gap-3 bg-background-color-2/50 dark:bg-dark-background-color-2/50 p-3 rounded-lg">
                      <span className="material-symbols-rounded text-font-color-highlight animate-spin text-sm">sync</span>
                      <span className="text-sm truncate" title={job.description}>{job.description}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Event Timeline */}
            <div>
              <h3 className="text-sm font-medium mb-3 opacity-80 uppercase tracking-wider">Event Timeline</h3>
              <div className="space-y-3 bg-background-color-2/30 dark:bg-dark-background-color-2/30 p-4 rounded-xl max-h-48 overflow-y-auto">
                {metrics?.timeline && metrics.timeline.length > 0 ? (
                  [...metrics.timeline].reverse().map((event, i) => (
                    <div key={i} className="flex gap-3 items-start text-sm">
                      <span className="text-font-color-highlight dark:text-dark-font-color-highlight shrink-0 text-xs mt-0.5">
                        {new Date(event.timestamp).toLocaleTimeString([], { hour12: false })}
                      </span>
                      <span className="opacity-90">{event.message}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm opacity-50 italic">Waiting for events...</p>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
});

const StatCard = ({ label, value, isError = false }: { label: string; value: string | number; isError?: boolean }) => (
  <div className="bg-background-color-2/50 dark:bg-dark-background-color-2/50 p-3 rounded-xl flex flex-col items-center justify-center text-center">
    <span className={`text-2xl font-light ${isError ? 'text-red-500' : 'text-font-color-black dark:text-font-color-white'}`}>
      {value}
    </span>
    <span className="text-xs mt-1 text-font-color-highlight dark:text-dark-font-color-highlight uppercase tracking-wider">
      {label}
    </span>
  </div>
);

LibraryDiagnosticsPanel.displayName = 'LibraryDiagnosticsPanel';
export default LibraryDiagnosticsPanel;
