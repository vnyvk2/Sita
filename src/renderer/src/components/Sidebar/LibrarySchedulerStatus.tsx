import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { store } from '../../store/store';
import { dndStore } from '../../workspace/store';
import { useStore } from '@tanstack/react-store';
import { useSchedulerMetrics } from '../../hooks/useSchedulerMetrics';
import ErrorBoundary from '../ErrorBoundary';

const LibrarySchedulerStatus = memo(() => {
  const metrics = useSchedulerMetrics();
  const { t } = useTranslation();
  const isExperimentalWorkspace = useStore(
    store,
    (s) => s.localStorage.preferences?.isExperimentalWorkspaceEnabled ?? false
  );
  const sidebarWidthMode = useStore(dndStore, (s) => s.sidebarWidthMode);
  const sidebarMode = useStore(dndStore, (s) => s.sidebarMode);
  const isCompact = isExperimentalWorkspace
    ? sidebarWidthMode === 'compact'
    : sidebarMode === 'compact';

  const openDiagnostics = useCallback(() => {
    import('../../store/store').then(({ dispatch }) => {
      dispatch({ type: 'TOGGLE_LIBRARY_DIAGNOSTICS_PANEL' });
    });
  }, []);

  if (!metrics) return null;

  const totalActive = metrics.queuedJobs + metrics.runningJobs;

  if (totalActive === 0 && metrics.runningJobs === 0) return null;

  // Use the first running job description as label if available
  const currentJob =
    metrics.runningJobsList && metrics.runningJobsList.length > 0
      ? metrics.runningJobsList[0].description
      : t('scheduler.processing_library_assets', 'Processing library assets...');

  const countsLabel = `${metrics.runningJobs} active worker${metrics.runningJobs === 1 ? '' : 's'} • ${metrics.queuedJobs} queued`;
  const statusLabel = `${currentJob} — ${countsLabel}`;

  // Compact rail (56px) cannot fit text: render icon-only status button instead
  // of a wrapped text strip. Full label stays available via tooltip/SR.
  if (isCompact) {
    return (
      <ErrorBoundary>
        <div className="flex w-full items-center justify-center py-3">
          <button
            type="button"
            onClick={openDiagnostics}
            title={statusLabel}
            aria-label={statusLabel}
            className="text-font-color-highlight dark:text-dark-font-color-highlight hover:bg-background-color-2/50 dark:hover:bg-dark-background-color-2/50 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full opacity-75 transition-colors"
          >
            <span className="material-symbols-rounded animate-spin text-lg">sync</span>
          </button>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div
        className="text-font-color-highlight dark:text-dark-font-color-highlight hover:bg-background-color-2/50 dark:hover:bg-dark-background-color-2/50 mt-4 flex w-full cursor-pointer items-center justify-between px-6 py-3 text-xs opacity-75 transition-colors"
        onClick={openDiagnostics}
      >
        <div className="flex w-full flex-col gap-1 overflow-hidden pr-2">
          <span className="truncate" title={currentJob}>
            {currentJob}
          </span>
          <span className="opacity-80">
            {metrics.runningJobs} active worker{metrics.runningJobs === 1 ? '' : 's'} •{' '}
            {metrics.queuedJobs} queued
          </span>
        </div>
        <span className="material-symbols-rounded animate-spin text-lg">sync</span>
      </div>
    </ErrorBoundary>
  );
});

LibrarySchedulerStatus.displayName = 'LibrarySchedulerStatus';
export default LibrarySchedulerStatus;
