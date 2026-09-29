import { memo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

export interface CompactListHeaderProps {
  className?: string;
}

export const CompactListHeader: FC<CompactListHeaderProps> = memo(({ className = '' }) => {
  const { t } = useTranslation();

  return (
    <div
      className={`compact-list-header text-font-color-dimmed border-background-color-2/40 dark:border-dark-background-color-2/40 flex h-[28px] items-center border-b px-2 text-[11px] font-semibold tracking-wider uppercase opacity-70 select-none ${className}`}
      aria-hidden="true"
    >
      <div className="w-[28px] shrink-0 text-center font-mono">#</div>
      <div className="min-w-0 flex-1 truncate pl-3">{t('common.title', 'Title')}</div>
      <div className="w-[22%] min-w-0 truncate pl-3">{t('common.artist', 'Artist')}</div>
      <div className="song-album hidden w-[20%] min-w-0 truncate pl-3 @[640px]/songs:block">
        {t('common.album', 'Album')}
      </div>
      <div className="min-w-[4rem] truncate pr-3 text-right">{t('common.duration', 'Time')}</div>
      <div className="min-w-[4.5rem] shrink-0" />
    </div>
  );
});

CompactListHeader.displayName = 'CompactListHeader';
