import { memo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

export interface CompactListHeaderProps {
  className?: string;
}

export const CompactListHeader: FC<CompactListHeaderProps> = memo(({ className = '' }) => {
  const { t } = useTranslation();

  return (
    <div
      className={`compact-list-header flex items-center h-[28px] px-2 text-[11px] font-semibold uppercase tracking-wider text-font-color-dimmed opacity-70 border-b border-background-color-2/40 dark:border-dark-background-color-2/40 select-none ${className}`}
      aria-hidden="true"
    >
      <div className="w-[28px] shrink-0 text-center font-mono">#</div>
      <div className="flex-1 min-w-0 pl-3 truncate">{t('common.title', 'Title')}</div>
      <div className="w-[22%] min-w-0 pl-3 truncate">{t('common.artist', 'Artist')}</div>
      <div className="w-[20%] min-w-0 pl-3 truncate">{t('common.album', 'Album')}</div>
      <div className="min-w-[4rem] text-right pr-3 truncate">{t('common.duration', 'Time')}</div>
      <div className="min-w-[4.5rem] shrink-0" />
    </div>
  );
});

CompactListHeader.displayName = 'CompactListHeader';
