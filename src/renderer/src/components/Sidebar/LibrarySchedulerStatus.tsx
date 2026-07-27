import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSchedulerMetrics } from '../../hooks/useSchedulerMetrics';
import ErrorBoundary from '../ErrorBoundary';

const LibrarySchedulerStatus = memo(() => {
  const metrics = useSchedulerMetrics();
  const { t } = useTranslation();

  if (!metrics) return null;

  const totalActive = metrics.queuedJobs + metrics.runningJobs;
  
  if (totalActive === 0 && metrics.runningJobs === 0) return null;

  // Use the first running job description as label if available
  const currentJob = metrics.runningJobsList && metrics.runningJobsList.length > 0 
    ? metrics.runningJobsList[0].description 
    : t('scheduler.processing_library_assets', 'Processing library assets...');

  return (
    <ErrorBoundary>
      <div 
        className="flex w-full items-center justify-between px-6 py-3 mt-4 text-xs text-font-color-highlight dark:text-dark-font-color-highlight opacity-75 cursor-pointer hover:bg-background-color-2/50 dark:hover:bg-dark-background-color-2/50 transition-colors"
        onClick={() => {
          import('../../store/store').then(({ dispatch }) => {
            dispatch({ type: 'TOGGLE_LIBRARY_DIAGNOSTICS_PANEL' });
          });
        }}
      >
        <div className="flex flex-col gap-1 overflow-hidden w-full pr-2">
          <span className="truncate" title={currentJob}>{currentJob}</span>
          <span className="opacity-80">
            {metrics.runningJobs} active worker{metrics.runningJobs === 1 ? '' : 's'} • {metrics.queuedJobs} queued
          </span>
        </div>
        <span className="material-symbols-rounded animate-spin text-lg">sync</span>
      </div>
    </ErrorBoundary>
  );
});

LibrarySchedulerStatus.displayName = 'LibrarySchedulerStatus';
export default LibrarySchedulerStatus;
