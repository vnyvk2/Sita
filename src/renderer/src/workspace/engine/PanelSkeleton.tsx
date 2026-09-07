import type { FC } from 'react';

export const PanelSkeleton: FC<{ title?: string }> = ({ title }) => {
  return (
    <div className="flex h-full w-full flex-col p-4">
      {title && (
        <div className="mb-3 flex items-center gap-2">
          <div className="h-4 w-4 animate-pulse rounded bg-stone-300 dark:bg-stone-700" />
          <span className="text-font-color-dimmed text-xs font-semibold tracking-wider uppercase">
            {title}
          </span>
        </div>
      )}
      <div className="flex-1 animate-pulse rounded-xl bg-stone-200/50 p-4 dark:bg-stone-800/40">
        <div className="mb-3 h-4 w-3/4 rounded bg-stone-300 dark:bg-stone-700" />
        <div className="mb-3 h-4 w-1/2 rounded bg-stone-300 dark:bg-stone-700" />
        <div className="h-4 w-2/3 rounded bg-stone-300 dark:bg-stone-700" />
      </div>
    </div>
  );
};
