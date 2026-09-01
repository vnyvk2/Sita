import React from 'react';

import type { AutoTagStage } from '../../../../common/metadata/types';

export interface AutoTagProgressOverlayProps {
  stage: AutoTagStage;
  message: string;
  progressPercent: number;
  onCancel?: () => void;
}

export const AutoTagProgressOverlay: React.FC<AutoTagProgressOverlayProps> = ({
  stage,
  message,
  progressPercent,
  onCancel
}) => {
  const getStageTitle = () => {
    switch (stage) {
      case 'searching':
        return 'Searching Release Candidates...';
      case 'resolving':
        return 'Resolving Release Tracklist...';
      case 'matching':
        return 'Matching Local Tracks...';
      case 'diffing':
        return 'Building Metadata Diffs...';
      case 'applying':
        return 'Applying Metadata Updates...';
      case 'completed':
        return 'Operation Completed';
      case 'cancelled':
        return 'Operation Cancelled';
      case 'failed':
        return 'Operation Failed';
      default:
        return 'Processing...';
    }
  };

  return (
    <div className="bg-background-color-1 dark:bg-dark-background-color-1 border-background-color-2 dark:border-dark-background-color-2 text-font-color-black dark:text-font-color-white flex flex-col gap-3 rounded-xl border p-5 shadow-xl">
      <div className="flex items-center justify-between">
        <span className="text-font-color-black dark:text-font-color-white text-sm font-semibold">
          {getStageTitle()}
        </span>
        <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs">
          {Math.round(progressPercent)}%
        </span>
      </div>

      <div className="bg-background-color-2 dark:bg-dark-background-color-2 relative h-2 w-full overflow-hidden rounded-full">
        <div
          className="bg-font-color-highlight dark:bg-dark-font-color-highlight h-full rounded-full transition-all duration-300 ease-out"
          style={{
            width: `${Math.min(100, Math.max(0, progressPercent))}%`
          }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs">
          {message}
        </span>
        {onCancel && stage !== 'completed' && stage !== 'cancelled' && (
          <button
            type="button"
            onClick={onCancel}
            className="bg-font-color-crimson/15 border-font-color-crimson/30 text-font-color-crimson hover:bg-font-color-crimson/25 cursor-pointer rounded-md border px-3 py-1 text-xs font-medium transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};
