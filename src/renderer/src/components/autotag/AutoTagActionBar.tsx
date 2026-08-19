import React from 'react';
import type { AutoTagStep } from '../../hooks/useAlbumAutoTag';

export interface AutoTagActionBarProps {
  step: AutoTagStep;
  selectedTracksCount: number;
  totalTracksCount: number;
  activeFieldsCount: number;
  totalChanges: number;
  canUndo: boolean;
  loading: boolean;
  onCancel: () => void;
  onApply: () => void;
  onUndo: () => void;
  onClose: () => void;
}

export const AutoTagActionBar: React.FC<AutoTagActionBarProps> = ({
  step,
  selectedTracksCount,
  totalTracksCount,
  activeFieldsCount,
  totalChanges,
  canUndo,
  loading,
  onCancel,
  onApply,
  onUndo,
  onClose
}) => {
  return (
    <div className="flex justify-between items-center px-6 py-4 border-t border-background-color-2 dark:border-dark-background-color-2 bg-background-color-2/80 dark:bg-dark-background-color-2/80 backdrop-blur-md">
      {/* Metrics Summary & Undo Link */}
      <div className="flex items-center gap-3 text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed">
        {totalTracksCount > 0 && (
          <>
            <span className={selectedTracksCount > 0 ? 'text-font-color-black dark:text-font-color-white font-semibold' : 'text-font-color-dimmed dark:text-dark-font-color-dimmed'}>
              ✓ {selectedTracksCount} / {totalTracksCount} tracks selected
            </span>
            <span>•</span>
            <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed font-medium">{activeFieldsCount} fields active</span>
            <span>•</span>
            <span className={`font-bold ${totalChanges > 0 ? 'text-font-color-highlight dark:text-dark-font-color-highlight' : 'text-font-color-dimmed dark:text-dark-font-color-dimmed'}`}>
              {totalChanges} changes
            </span>
            {selectedTracksCount === 0 && totalChanges > 0 && (
              <>
                <span>•</span>
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  ({totalTracksCount} files affected by album metadata)
                </span>
              </>
            )}
          </>
        )}

        {canUndo && (
          <>
            <span>•</span>
            <button
              type="button"
              onClick={onUndo}
              disabled={loading}
              className="bg-red-500/15 border border-red-500/30 text-font-color-crimson rounded px-2 py-0.5 text-xs font-semibold hover:bg-red-500/25 transition-colors cursor-pointer flex items-center gap-1"
            >
              ↶ Undo available
            </button>
          </>
        )}
      </div>

      {/* Primary Action Buttons */}
      <div className="flex gap-2.5 items-center">
        <button
          type="button"
          onClick={step === 'complete' ? onClose : onCancel}
          className="px-4 py-2 rounded-lg bg-background-color-2 hover:bg-background-color-3/40 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3/40 border border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-black dark:text-font-color-white text-sm font-medium transition-colors cursor-pointer"
        >
          {step === 'complete' ? 'Close' : 'Cancel'}
        </button>

        {step !== 'complete' && (
          <button
            type="button"
            onClick={onApply}
            disabled={totalChanges === 0 || loading}
            className="px-5 py-2 rounded-lg bg-background-color-3 hover:bg-background-color-3/80 dark:bg-dark-background-color-3 dark:hover:bg-dark-background-color-3/80 text-font-color-black dark:text-font-color-black text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm flex items-center gap-1.5"
          >
            {loading
              ? 'Applying Changes...'
              : `✓ Apply ${totalChanges ?? 0} Changes`}
          </button>
        )}
      </div>
    </div>
  );
};

