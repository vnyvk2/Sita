import { useEffect, useRef, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useEffectiveAppearance } from '../../hooks/useEffectiveAppearance';
import { useTrackIdentify } from '../../hooks/useTrackIdentify';
import type { SongDataForAutoTag } from '../../utils/autoTagUtils';

export interface TrackIdentifyDialogProps {
  isOpen: boolean;
  songs: SongDataForAutoTag[];
  onClose: () => void;
}

export function TrackIdentifyDialog({ isOpen, songs, onClose }: TrackIdentifyDialogProps) {
  const { isDark } = useEffectiveAppearance();
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const searchedIndexRef = useRef<number | null>(null);

  const { state, actions } = useTrackIdentify(songs);

  // Focus preservation and Escape key to close
  useEffect(() => {
    if (!isOpen) {
      searchedIndexRef.current = null;
      actions.reset();
      return undefined;
    }

    previousFocusRef.current = document.activeElement as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);

    // Auto-trigger search when opening or advancing to a new track
    if (songs.length > 0 && searchedIndexRef.current !== state.currentIndex) {
      searchedIndexRef.current = state.currentIndex;
      void actions.search();
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen, state.currentIndex, songs.length, onClose]);

  if (!isOpen) return null;

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    actions.search();
  };

  const renderContent = () => {
    if (state.isComplete) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
          <span className="material-icons-round text-6xl text-green-500">check_circle</span>
          <h2 className="text-2xl font-bold">Identification Complete</h2>
          <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed">
            Successfully applied metadata to {state.appliedCount} track{state.appliedCount !== 1 ? 's' : ''}.
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-background-color-3 dark:bg-dark-background-color-3 hover:bg-background-color-2 dark:hover:bg-dark-background-color-2 rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full max-h-[70vh]">
        {/* Error Banner */}
        {state.error && (
          <div className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-3 mb-4 rounded-lg flex items-center text-sm">
            <span className="material-icons-round mr-2 text-base">error</span>
            {state.error}
          </div>
        )}

        {/* Search Form */}
        <form onSubmit={handleSearchSubmit} className="flex gap-3 mb-6 bg-background-color-2 dark:bg-dark-background-color-2 p-4 rounded-xl">
          <div className="flex-1 flex flex-col gap-1">
            <label htmlFor="track-identify-title" className="text-xs font-semibold text-font-color-dimmed dark:text-dark-font-color-dimmed uppercase tracking-wider">Track Title *</label>
            <input
              id="track-identify-title"
              type="text"
              required
              value={state.searchTitle}
              onChange={e => actions.setSearchTitle(e.target.value)}
              className="bg-background-color-1 dark:bg-dark-background-color-1 border border-background-color-3 dark:border-dark-background-color-3 rounded p-2 text-sm focus:outline-none focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight"
            />
          </div>
          <div className="flex-1 flex flex-col gap-1">
            <label htmlFor="track-identify-artist" className="text-xs font-semibold text-font-color-dimmed dark:text-dark-font-color-dimmed uppercase tracking-wider">Artist</label>
            <input
              id="track-identify-artist"
              type="text"
              value={state.searchArtist}
              onChange={e => actions.setSearchArtist(e.target.value)}
              className="bg-background-color-1 dark:bg-dark-background-color-1 border border-background-color-3 dark:border-dark-background-color-3 rounded p-2 text-sm focus:outline-none focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight"
            />
          </div>
          <div className="flex-1 flex flex-col gap-1">
            <label htmlFor="track-identify-album" className="text-xs font-semibold text-font-color-dimmed dark:text-dark-font-color-dimmed uppercase tracking-wider">Album</label>
            <input
              id="track-identify-album"
              type="text"
              value={state.searchAlbum}
              onChange={e => actions.setSearchAlbum(e.target.value)}
              className="bg-background-color-1 dark:bg-dark-background-color-1 border border-background-color-3 dark:border-dark-background-color-3 rounded p-2 text-sm focus:outline-none focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight"
            />
          </div>
          <div className="flex items-end pb-[2px]">
            <button
              type="submit"
              disabled={state.loadingSearch}
              className="bg-font-color-highlight dark:bg-dark-font-color-highlight text-white px-4 py-2 rounded font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center h-[38px]"
            >
              {state.loadingSearch ? (
                <span className="material-icons-round animate-spin text-sm">refresh</span>
              ) : (
                'Search'
              )}
            </button>
          </div>
        </form>

        <div className="flex gap-6 overflow-hidden flex-1">
          {/* Candidates List */}
          <div className="flex-1 flex flex-col min-w-0">
            <h3 className="text-sm font-semibold mb-3 text-font-color-dimmed dark:text-dark-font-color-dimmed">
              Top Matches ({state.candidates.length})
            </h3>
            <div className="overflow-y-auto pr-2 space-y-2 flex-1 styled-scrollbar">
              {state.loadingSearch ? (
                <div className="flex justify-center p-8">
                  <span className="material-icons-round animate-spin text-3xl text-font-color-dimmed dark:text-dark-font-color-dimmed">refresh</span>
                </div>
              ) : state.candidates.length === 0 ? (
                <div className="text-center p-8 text-font-color-dimmed dark:text-dark-font-color-dimmed">
                  No matches found. Try adjusting the search terms.
                </div>
              ) : (
                state.candidates.map(candidate => (
                  <label
                    key={candidate.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      state.selectedCandidateId === candidate.id
                        ? 'border-font-color-highlight dark:border-dark-font-color-highlight bg-background-color-2 dark:bg-dark-background-color-2'
                        : 'border-transparent hover:bg-background-color-2/50 dark:hover:bg-dark-background-color-2/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="candidate"
                      className="accent-font-color-highlight dark:accent-dark-font-color-highlight mt-1 self-start"
                      checked={state.selectedCandidateId === candidate.id}
                      onChange={() => actions.selectCandidate(candidate.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{candidate.title}</div>
                      <div className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed truncate mt-0.5">
                        {candidate.artist || 'Unknown Artist'} • {candidate.album || 'Unknown Album'} {candidate.year ? `(${candidate.year})` : ''}
                      </div>
                    </div>
                    {candidate.confidenceScore !== undefined && (
                      <div className="bg-background-color-3 dark:bg-dark-background-color-3 text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap">
                        {Math.round(candidate.confidenceScore * 100)}%
                      </div>
                    )}
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Diffs Panel */}
          {state.selectedCandidateId && state.fieldDiffs.length > 0 && (
            <div className="flex-1 flex flex-col min-w-0 border-l border-background-color-3 dark:border-dark-background-color-3 pl-6">
              <h3 className="text-sm font-semibold mb-3 text-font-color-dimmed dark:text-dark-font-color-dimmed">
                Metadata Changes
              </h3>
              <div className="overflow-y-auto pr-2 flex-1 styled-scrollbar">
                {state.loadingPreview ? (
                  <div className="flex justify-center p-8">
                    <span className="material-icons-round animate-spin text-3xl text-font-color-dimmed dark:text-dark-font-color-dimmed">refresh</span>
                  </div>
                ) : (
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="border-b border-background-color-3 dark:border-dark-background-color-3 text-font-color-dimmed dark:text-dark-font-color-dimmed">
                        <th className="pb-2 font-medium w-8"></th>
                        <th className="pb-2 font-medium capitalize">Field</th>
                        <th className="pb-2 font-medium">Current</th>
                        <th className="pb-2 font-medium">New</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.fieldDiffs.map(diff => (
                        <tr key={diff.fieldId} className="border-b border-background-color-2 dark:border-dark-background-color-2 last:border-0">
                          <td className="py-2.5">
                            <input
                              type="checkbox"
                              checked={diff.enabled}
                              onChange={() => actions.toggleField(diff.fieldId)}
                              className="accent-font-color-highlight dark:accent-dark-font-color-highlight rounded"
                            />
                          </td>
                          <td className="py-2.5 capitalize font-medium text-font-color-dimmed dark:text-dark-font-color-dimmed">
                            {diff.fieldId === 'artworkUrl' ? 'Cover Art' : diff.fieldId}
                          </td>
                          <td className="py-2.5 max-w-[120px] truncate pr-2 text-font-color-dimmed dark:text-dark-font-color-dimmed" title={String(diff.oldValue || '')}>
                            {diff.fieldId === 'artworkUrl' && diff.oldValue ? (
                              <img
                                src={
                                  String(diff.oldValue).startsWith('http') ||
                                  String(diff.oldValue).startsWith('atom')
                                    ? String(diff.oldValue)
                                    : `atom://${String(diff.oldValue)}`
                                }
                                alt="Current cover"
                                className="w-10 h-10 object-cover rounded shadow-sm"
                              />
                            ) : (
                              diff.oldValue || '-'
                            )}
                          </td>
                          <td className="py-2.5 max-w-[120px] truncate" title={String(diff.suggestedValue || '')}>
                            {diff.fieldId === 'artworkUrl' && diff.suggestedValue ? (
                              <img
                                src={String(diff.suggestedValue)}
                                alt="New cover"
                                className="w-10 h-10 object-cover rounded shadow-sm"
                              />
                            ) : (
                              diff.suggestedValue || '-'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return createPortal(
    <div className={`fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 ${isDark ? 'dark' : ''}`}>
      <div 
        className="w-full max-w-[700px] bg-background-color-1 dark:bg-dark-background-color-1 text-font-color-black dark:text-font-color-white rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-background-color-3 dark:border-dark-background-color-3"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-background-color-3 dark:border-dark-background-color-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-background-color-2 dark:bg-dark-background-color-2 flex items-center justify-center text-font-color-highlight dark:text-dark-font-color-highlight">
              <span className="material-icons-round">audiotrack</span>
            </div>
            <div>
              <h2 className="font-bold text-lg leading-tight">Identify Track</h2>
              {!state.isComplete && songs.length > 0 && (
                <p className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed">
                  {state.currentIndex + 1} of {songs.length}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-background-color-2 dark:hover:bg-dark-background-color-2 transition-colors text-font-color-dimmed dark:text-dark-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white"
          >
            <span className="material-icons-round text-xl">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {renderContent()}
        </div>

        {/* Footer */}
        {!state.isComplete && (
          <div className="p-5 border-t border-background-color-3 dark:border-dark-background-color-3 bg-background-color-1/50 dark:bg-dark-background-color-1/50 flex items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={actions.prevTrack}
                disabled={state.currentIndex === 0 || state.loadingApply}
                className="px-4 py-2 flex items-center gap-2 rounded-lg bg-background-color-2 dark:bg-dark-background-color-2 hover:bg-background-color-3 dark:hover:bg-dark-background-color-3 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                <span className="material-icons-round text-sm">arrow_back_ios_new</span>
                Prev
              </button>
              <button
                onClick={actions.skipTrack}
                disabled={state.loadingApply}
                className="px-4 py-2 flex items-center gap-2 rounded-lg bg-background-color-2 dark:bg-dark-background-color-2 hover:bg-background-color-3 dark:hover:bg-dark-background-color-3 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                Skip
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={actions.applyAll}
                disabled={songs.length <= 1 || state.loadingApply || state.loadingSearch}
                className="px-4 py-2 rounded-lg border border-background-color-3 dark:border-dark-background-color-3 hover:bg-background-color-2 dark:hover:bg-dark-background-color-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                Apply All Remaining
              </button>
              <button
                onClick={() => void actions.applyCurrentTrack()}
                disabled={!state.preview || state.loadingApply}
                className="px-6 py-2 flex items-center gap-2 rounded-lg bg-font-color-highlight dark:bg-dark-font-color-highlight text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity text-sm font-medium"
              >
                {state.loadingApply ? (
                  <span className="material-icons-round animate-spin text-sm">refresh</span>
                ) : (
                  <>
                    Apply
                    <span className="material-icons-round text-sm">arrow_forward_ios</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
