import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSchedulerMetrics } from '../../hooks/useSchedulerMetrics';
import ErrorBoundary from '../ErrorBoundary';

const LibrarySchedulerStatus = memo(() => {
  const metrics = useSchedulerMetrics();
  const { t } = useTranslation();

  if (!metrics) return null;

  const totalActive = metrics.queuedJobs + metrics.runningJobs;
  
  if (totalActive === 0) return null;

  // Render a subtle indicator based on the current job type or general processing
  const label = metrics.currentJobType === 'artwork' 
    ? t('scheduler.generating_artworks', 'Generating artworks...') 
    : metrics.currentJobType === 'palette' 
      ? t('scheduler.generating_palettes', 'Generating palettes...') 
      : t('scheduler.processing_library_assets', 'Processing library assets...');

  return (
    <ErrorBoundary>
      <div className="flex w-full items-center justify-between px-6 py-3 mt-4 text-xs text-font-color-highlight dark:text-dark-font-color-highlight opacity-75">
        <div className="flex flex-col gap-1 overflow-hidden">
          <span className="truncate" title={label}>{label}</span>
          <span>{t('scheduler.remaining', '({{totalActive}} remaining)', { totalActive })}</span>
        </div>
        <span className="material-symbols-rounded animate-spin text-lg">sync</span>
      </div>
    </ErrorBoundary>
  );
});

LibrarySchedulerStatus.displayName = 'LibrarySchedulerStatus';
export default LibrarySchedulerStatus;
