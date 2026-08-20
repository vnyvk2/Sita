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
    <div className="p-5 rounded-xl bg-background-color-1 dark:bg-dark-background-color-1 border border-background-color-2 dark:border-dark-background-color-2 text-font-color-black dark:text-font-color-white flex flex-col gap-3 shadow-xl">
      <div className="flex justify-between items-center">
        <span className="font-semibold text-sm text-font-color-black dark:text-font-color-white">{getStageTitle()}</span>
        <span className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed">{Math.round(progressPercent)}%</span>
      </div>

      <div className="w-full h-2 bg-background-color-2 dark:bg-dark-background-color-2 rounded-full overflow-hidden relative">
        <div
          className="h-full bg-font-color-highlight dark:bg-dark-font-color-highlight rounded-full transition-all duration-300 ease-out"
          style={{
            width: `${Math.min(100, Math.max(0, progressPercent))}%`
          }}
        />
      </div>

      <div className="flex justify-between items-center">
        <span className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed">{message}</span>
        {onCancel && stage !== 'completed' && stage !== 'cancelled' && (
          <button
            type="button"
            onClick={onCancel}
            className="bg-font-color-crimson/15 border border-font-color-crimson/30 text-font-color-crimson rounded-md px-3 py-1 text-xs font-medium hover:bg-font-color-crimson/25 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};

