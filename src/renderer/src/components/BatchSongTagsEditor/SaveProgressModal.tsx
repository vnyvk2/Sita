import { memo } from 'react';

import Button from '../Button';

export interface SaveProgressModalProps {
  isOpen: boolean;
  isSaving: boolean;
  current: number;
  total: number;
  results: BatchSongItemResult[];
  onClose: () => void;
}

export const SaveProgressModal = memo(function SaveProgressModal({
  isOpen,
  isSaving,
  current,
  total,
  results,
  onClose
}: SaveProgressModalProps) {
  if (!isOpen) return null;

  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  const failedItems = results.filter((r) => r.status !== 'saved');
  const savedCount = results.filter((r) => r.status === 'saved').length;
  const isComplete = !isSaving;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="bg-background-color-1 dark:bg-dark-background-color-1 border-background-color-2 dark:border-dark-background-color-2 w-full max-w-lg rounded-2xl border p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-font-color-black dark:text-font-color-white text-lg font-semibold">
            {isSaving ? 'Saving Metadata Changes' : 'Batch Save Complete'}
          </h2>
          {isComplete && (
            <button
              onClick={onClose}
              className="text-font-color-dimmed hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:text-font-color-white cursor-pointer"
            >
              <span className="material-icons-round">close</span>
            </button>
          )}
        </div>

        {/* Progress bar */}
        {isSaving ? (
          <div className="space-y-3 py-2">
            <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed flex justify-between text-xs">
              <span>
                Saving track {current} of {total}...
              </span>
              <span>{percentage}%</span>
            </div>
            <div className="bg-background-color-2 dark:bg-dark-background-color-2 h-2.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-font-color-highlight dark:bg-dark-font-color-highlight h-full rounded-full transition-all duration-200"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Status overview */}
            <div className="bg-background-color-2/40 dark:bg-dark-background-color-2/40 flex items-center gap-3 rounded-lg p-3 text-sm">
              <span
                className={`material-icons-round text-2xl ${failedItems.length > 0 ? 'text-amber-500' : 'text-emerald-500'}`}
              >
                {failedItems.length > 0 ? 'warning' : 'check_circle'}
              </span>
              <div>
                <p className="text-font-color-black dark:text-font-color-white font-medium">
                  {failedItems.length === 0
                    ? `Successfully updated all ${savedCount} tracks.`
                    : `${savedCount} tracks saved, ${failedItems.length} failed.`}
                </p>
                {failedItems.length > 0 && (
                  <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs">
                    Some audio files could not be updated or written to disk.
                  </p>
                )}
              </div>
            </div>

            {/* Error List if any failures */}
            {failedItems.length > 0 && (
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs">
                <p className="font-semibold text-red-500">Failed Items:</p>
                {failedItems.map((item) => (
                  <div
                    key={item.songId}
                    className="text-font-color-dimmed dark:text-dark-font-color-dimmed flex justify-between"
                  >
                    <span>
                      Song ID: {item.songId} ({item.status})
                    </span>
                    <span className="max-w-[200px] truncate text-red-400">
                      {item.message || 'Write error'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex justify-end gap-3">
          {isComplete && (
            <Button
              label="Done"
              clickHandler={onClose}
              className="bg-font-color-highlight dark:bg-dark-font-color-highlight rounded-lg px-4 py-2 text-xs font-medium text-white"
            />
          )}
        </div>
      </div>
    </div>
  );
});

export default SaveProgressModal;
