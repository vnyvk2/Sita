import React from 'react';

export const InsightsSkeleton = () => {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="border-background-color-2/40 bg-background-color-1/60 dark:border-dark-background-color-2/40 dark:bg-dark-background-color-1/60 h-72 animate-pulse rounded-2xl border p-5"
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="bg-background-color-2 dark:bg-dark-background-color-2 h-8 w-8 rounded-xl" />
              <div className="bg-background-color-2 dark:bg-dark-background-color-2 h-4 w-24 rounded" />
            </div>
            <div className="bg-background-color-2 dark:bg-dark-background-color-2 h-4 w-12 rounded" />
          </div>
          <div className="bg-background-color-2 dark:bg-dark-background-color-2 mb-4 h-10 w-32 rounded" />
          <div className="mb-6 grid grid-cols-3 gap-2">
            <div className="bg-background-color-2 dark:bg-dark-background-color-2 h-12 rounded-xl" />
            <div className="bg-background-color-2 dark:bg-dark-background-color-2 h-12 rounded-xl" />
            <div className="bg-background-color-2 dark:bg-dark-background-color-2 h-12 rounded-xl" />
          </div>
          <div className="bg-background-color-2 dark:bg-dark-background-color-2 h-20 rounded-xl" />
        </div>
      ))}
    </div>
  );
};
