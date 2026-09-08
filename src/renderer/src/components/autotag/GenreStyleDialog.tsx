/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEffectiveAppearance } from '../../hooks/useEffectiveAppearance';
import { useGenreStyleTag } from '../../hooks/useGenreStyleTag';
import type { SongDataForAutoTag } from '../../utils/autoTagUtils';

export interface GenreStyleDialogProps {
  isOpen: boolean;
  songs: SongDataForAutoTag[];
  onClose: () => void;
}

export const GenreStyleDialog: React.FC<GenreStyleDialogProps> = ({
  isOpen,
  songs,
  onClose,
}) => {
  const { isDark } = useEffectiveAppearance();
  const { state, actions } = useGenreStyleTag(songs);
  const overlayRef = useRef<HTMLDivElement>(null);
  
  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Handle outside click to close
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const totalAlbums = state.groups.length;
  const enabledCount = state.groups.filter((g) => g.enabled).length;
  
  const handleApply = async () => {
    const success = await actions.applyAll();
    if (success) {
      setTimeout(() => {
        onClose();
      }, 1500); // give the user time to see the success state
    }
  };

  const dialogContent = (
    <div
      className={`${
        isDark ? 'dark' : ''
      } fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm`}
      ref={overlayRef}
      onClick={handleBackdropClick}
    >
      <div
        className="flex w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-background-color-2 bg-background-color-1 shadow-2xl transition-all dark:border-dark-background-color-2 dark:bg-dark-background-color-1"
        role="dialog"
        aria-modal="true"
        aria-labelledby="genre-style-dialog-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-background-color-2 px-6 py-4 dark:border-dark-background-color-2">
          <div className="flex items-center gap-3">
            <span className="material-symbols-rounded text-2xl text-font-color-highlight dark:text-dark-font-color-highlight">
              label
            </span>
            <h2
              id="genre-style-dialog-title"
              className="text-xl font-semibold text-font-color-black dark:text-font-color-white"
            >
              Update Genres & Styles
            </h2>
            <span className="ml-2 rounded-full bg-background-color-2 px-2 py-0.5 text-xs font-medium text-font-color-black dark:bg-dark-background-color-2 dark:text-font-color-white">
              {songs.length} track{songs.length === 1 ? '' : 's'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-font-color-black transition-colors hover:bg-background-color-2 dark:text-font-color-white dark:hover:bg-dark-background-color-2"
            title="Close"
            aria-label="Close dialog"
          >
            <span className="material-symbols-rounded">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="min-h-[300px] max-h-[60vh] flex-1 overflow-y-auto bg-background-color-1 p-6 dark:bg-dark-background-color-1">
          {state.error && (
            <div className="mb-4 rounded-lg bg-red-100 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {state.error}
            </div>
          )}

          {state.isComplete ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                <span className="material-symbols-rounded text-4xl">check_circle</span>
              </div>
              <div>
                <h3 className="mb-1 text-lg font-medium text-font-color-black dark:text-font-color-white">
                  Successfully Applied
                </h3>
                <p className="text-sm text-font-color-black/70 dark:text-font-color-white/70">
                  Updated {state.appliedCount} album{state.appliedCount === 1 ? '' : 's'} with new genres and styles.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {state.groups.length === 0 && !state.loading && (
                <div className="flex h-32 items-center justify-center text-sm text-font-color-black/50 dark:text-font-color-white/50">
                  No albums found for these tracks.
                </div>
              )}
              {state.groups.map((group) => (
                <div
                  key={group.albumName}
                  className={`flex flex-col rounded-xl border p-4 transition-colors ${
                    group.enabled
                      ? 'border-background-color-3 bg-background-color-2 dark:border-dark-background-color-3 dark:bg-dark-background-color-2'
                      : 'border-background-color-2 bg-background-color-1 opacity-70 dark:border-dark-background-color-2 dark:bg-dark-background-color-1'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <label className="flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={group.enabled}
                        onChange={() => actions.toggleGroup(group.albumName)}
                        disabled={
                          group.status === 'searching' ||
                          group.status === 'pending' ||
                          state.applying ||
                          state.isComplete
                        }
                        className="h-4 w-4 cursor-pointer rounded border-gray-300 text-font-color-highlight focus:ring-font-color-highlight dark:border-gray-600 dark:bg-gray-700"
                        aria-label={`Enable genre/style update for ${group.albumName}`}
                      />
                    </label>

                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background-color-3 text-font-color-black dark:bg-dark-background-color-3 dark:text-font-color-white">
                      <span className="material-symbols-rounded">album</span>
                    </div>

                    <div className="flex-1 overflow-hidden">
                      <h4 className="truncate font-medium text-font-color-black dark:text-font-color-white">
                        {group.albumName || 'Unknown Album'}
                      </h4>
                      <p className="truncate text-xs text-font-color-black/70 dark:text-font-color-white/70">
                        {group.artist || 'Unknown Artist'} • {group.songs.length} track
                        {group.songs.length > 1 ? 's' : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {group.status === 'searching' && (
                        <div className="flex items-center gap-2 text-sm text-font-color-black/60 dark:text-font-color-white/60">
                          <span className="material-symbols-rounded animate-spin">
                            progress_activity
                          </span>
                          Searching...
                        </div>
                      )}

                      {group.status === 'found' && (
                        <div className="flex max-w-[200px] flex-wrap items-center justify-end gap-1.5">
                          {group.genre && (
                            <span
                              className="max-w-full truncate rounded bg-font-color-highlight/10 px-2 py-0.5 text-xs font-medium text-font-color-highlight dark:bg-dark-font-color-highlight/20 dark:text-dark-font-color-highlight"
                              title={group.genre}
                            >
                              {group.genre}
                            </span>
                          )}
                          {group.style && (
                            <span
                              className="max-w-full truncate rounded bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:bg-blue-400/20 dark:text-blue-300"
                              title={group.style}
                            >
                              {group.style}
                            </span>
                          )}
                        </div>
                      )}

                      {(group.status === 'error' || group.status === 'not_found') && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-500 dark:text-red-400">
                            {group.status === 'not_found' ? 'Not found' : 'Error'}
                          </span>
                          <button
                            onClick={() => actions.retryGroup(group.albumName)}
                            disabled={state.applying}
                            className="flex items-center justify-center rounded-full p-1 text-font-color-black/60 transition-colors hover:bg-background-color-3 hover:text-font-color-black dark:text-font-color-white/60 dark:hover:bg-dark-background-color-3 dark:hover:text-font-color-white"
                            title="Retry"
                            aria-label="Retry search"
                          >
                            <span className="material-symbols-rounded text-sm">refresh</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-background-color-2 bg-background-color-1/50 px-6 py-4 dark:border-dark-background-color-2 dark:bg-dark-background-color-1/50">
          <div className="mb-4 flex items-center justify-between text-xs text-font-color-black/60 dark:text-font-color-white/60">
            <span>Source: Discogs</span>
            <span>
              {totalAlbums} album{totalAlbums !== 1 ? 's' : ''} • {songs.length} track
              {songs.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="flex justify-end gap-3">
            {!state.isComplete && (
              <button
                onClick={onClose}
                disabled={state.applying}
                className="rounded-lg px-4 py-2 text-sm font-medium text-font-color-black transition-colors hover:bg-background-color-2 disabled:opacity-50 dark:text-font-color-white dark:hover:bg-dark-background-color-2"
              >
                Cancel
              </button>
            )}

            {!state.isComplete ? (
              <button
                onClick={handleApply}
                disabled={enabledCount === 0 || state.applying || state.loading}
                className="flex items-center gap-2 rounded-lg bg-font-color-highlight px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-font-color-highlight/90 disabled:opacity-50 dark:bg-dark-font-color-highlight dark:hover:bg-dark-font-color-highlight/90"
              >
                {state.applying ? (
                  <span className="material-symbols-rounded animate-spin text-sm">
                    progress_activity
                  </span>
                ) : (
                  <span className="material-symbols-rounded text-sm">check</span>
                )}
                {state.applying ? 'Applying...' : `Apply ${enabledCount} Changes`}
              </button>
            ) : (
              <button
                onClick={onClose}
                className="rounded-lg bg-font-color-highlight px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-font-color-highlight/90 dark:bg-dark-font-color-highlight dark:hover:bg-dark-font-color-highlight/90"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(dialogContent, document.body);
};
