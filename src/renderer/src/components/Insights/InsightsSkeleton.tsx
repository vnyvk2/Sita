import React from 'react';

export const InsightsSkeleton = () => {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-72 animate-pulse rounded-2xl border border-background-color-2/40 bg-background-color-1/60 p-5 dark:border-dark-background-color-2/40 dark:bg-dark-background-color-1/60"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-background-color-2 dark:bg-dark-background-color-2" />
              <div className="h-4 w-24 rounded bg-background-color-2 dark:bg-dark-background-color-2" />
            </div>
            <div className="h-4 w-12 rounded bg-background-color-2 dark:bg-dark-background-color-2" />
          </div>
          <div className="h-10 w-32 rounded bg-background-color-2 dark:bg-dark-background-color-2 mb-4" />
          <div className="grid grid-cols-3 gap-2 mb-6">
            <div className="h-12 rounded-xl bg-background-color-2 dark:bg-dark-background-color-2" />
            <div className="h-12 rounded-xl bg-background-color-2 dark:bg-dark-background-color-2" />
            <div className="h-12 rounded-xl bg-background-color-2 dark:bg-dark-background-color-2" />
          </div>
          <div className="h-20 rounded-xl bg-background-color-2 dark:bg-dark-background-color-2" />
        </div>
      ))}
    </div>
  );
};
