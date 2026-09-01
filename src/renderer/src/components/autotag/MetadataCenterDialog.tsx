import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useAlbumAutoTag } from '../../hooks/useAlbumAutoTag';
import { useEffectiveAppearance } from '../../hooks/useEffectiveAppearance';
import { AutoTagActionBar } from './AutoTagActionBar';
import { AutoTagProgressOverlay } from './AutoTagProgressOverlay';
import { CandidateMatchesTable } from './CandidateMatchesTable';
import { CompactReviewView } from './CompactReviewView';
import { ConfidenceBadge } from './ConfidenceBadge';
import { GlobalFieldDiffTable } from './GlobalFieldDiffTable';
import { SearchCriteriaBar } from './SearchCriteriaBar';
import { SelectedReleasePanel } from './SelectedReleasePanel';
import { TrackComparisonTable } from './TrackComparisonTable';
import { isInteractiveElement } from './utils/previewSummary';

export interface MetadataCenterDialogProps {
  isOpen: boolean;
  localSongs: any[];
  initialAlbumName?: string;
  initialArtistName?: string;
  initialWorkflow?: string;
  operationId?: string;
  onClose: () => void;
}

export type ReviewViewMode = 'compact' | 'detailed';

export const MetadataCenterDialog: React.FC<MetadataCenterDialogProps> = ({
  isOpen,
  localSongs,
  initialAlbumName = '',
  initialArtistName = '',
  operationId,
  onClose
}) => {
  const { isDark } = useEffectiveAppearance();
  const { state, actions } = useAlbumAutoTag(operationId, localSongs);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [viewMode, setViewMode] = useState<ReviewViewMode>('compact');
  const [expandedTrackId, setExpandedTrackId] = useState<number | null>(null);
  const [focusedTrackIndex, setFocusedTrackIndex] = useState<number>(0);
  const previousFocusRef = useRef<Element | null>(null);

  // Focus preservation
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      setShowErrorDetails(false);

      if (initialAlbumName) actions.setSearchAlbum(initialAlbumName);
      if (initialArtistName) actions.setSearchArtist(initialArtistName);

      if (initialAlbumName) {
        actions.searchReleases(initialAlbumName, initialArtistName);
      }
    }
  }, [isOpen, initialAlbumName, initialArtistName]);

  const handleClose = () => {
    actions.reset();
    onClose();

    requestAnimationFrame(() => {
      const prev = previousFocusRef.current;
      if (prev instanceof HTMLElement && document.contains(prev)) {
        prev.focus();
      }
    });
  };

  const handleOpenDetailed = (songId: number) => {
    setExpandedTrackId(songId);
    setViewMode('detailed');
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }

      // Mode switch shortcut: Ctrl+D or Cmd+D
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        setViewMode((prev) => (prev === 'compact' ? 'detailed' : 'compact'));
        return;
      }

      // Apply shortcut: Enter (guarded against active text inputs)
      if (e.key === 'Enter') {
        if (isInteractiveElement(document.activeElement)) {
          return;
        }
        if (state.preview && state.selectedTrackIds.size > 0 && !state.loading) {
          e.preventDefault();
          actions.applyPreview();
          return;
        }
      }

      // Roving keyboard navigation when review matches are visible
      if (state.preview && !isInteractiveElement(document.activeElement)) {
        const matches = state.filteredMatches;
        if (!matches || matches.length === 0) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setFocusedTrackIndex((prev) => Math.min(prev + 1, matches.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setFocusedTrackIndex((prev) => Math.max(prev - 1, 0));
        } else if (e.key === ' ') {
          e.preventDefault();
          const currentTrack = matches[focusedTrackIndex];
          if (currentTrack) {
            actions.toggleTrack(currentTrack.localSongId);
          }
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          const currentTrack = matches[focusedTrackIndex];
          if (currentTrack) {
            setExpandedTrackId(currentTrack.localSongId);
          }
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setExpandedTrackId(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    state.preview,
    state.filteredMatches,
    focusedTrackIndex,
    state.selectedTrackIds?.size,
    state.loading,
    viewMode
  ]);

  if (!isOpen) return null;

  return createPortal(
    <div
      onClick={handleClose}
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm ${isDark ? 'dark' : ''}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-background-color-1 dark:bg-dark-background-color-1 border-background-color-2 dark:border-dark-background-color-2 text-font-color-black dark:text-font-color-white flex max-h-[92vh] w-[95%] max-w-[1080px] flex-col overflow-hidden rounded-2xl border shadow-2xl"
      >
        {/* Header Bar */}
        <div className="border-background-color-2 dark:border-dark-background-color-2 bg-background-color-2/50 dark:bg-dark-background-color-2/50 flex items-center justify-between border-b px-5 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-rounded material-icons-round text-font-color-highlight dark:text-dark-font-color-highlight text-xl leading-none select-none">
              auto_awesome
            </span>
            <div>
              <div className="text-font-color-highlight dark:text-dark-font-color-highlight text-sm leading-snug font-bold">
                Metadata Center / AutoTag
              </div>
              <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[11px]">
                Search, compare and apply verified metadata
              </div>
            </div>
            {state.preview && (
              <ConfidenceBadge
                level={state.preview.confidenceLevel}
                confidence={state.preview.overallConfidence}
              />
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {/* View Mode Toggle Pill (Compact vs Detailed) */}
            {state.preview && (
              <div className="bg-background-color-2 dark:bg-dark-background-color-2 border-background-color-3/40 dark:border-dark-background-color-3/40 flex rounded-lg border p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('compact')}
                  className={`flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-semibold transition-colors ${
                    viewMode === 'compact'
                      ? 'bg-background-color-1 dark:bg-dark-background-color-1 text-font-color-highlight dark:text-dark-font-color-highlight shadow-xs'
                      : 'text-font-color-dimmed dark:text-dark-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white'
                  }`}
                >
                  <span>⊞</span>
                  <span>Compact</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('detailed')}
                  className={`flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-semibold transition-colors ${
                    viewMode === 'detailed'
                      ? 'bg-background-color-1 dark:bg-dark-background-color-1 text-font-color-highlight dark:text-dark-font-color-highlight shadow-xs'
                      : 'text-font-color-dimmed dark:text-dark-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white'
                  }`}
                >
                  <span>☷</span>
                  <span>Detailed</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleClose}
              className="bg-background-color-2 hover:bg-background-color-3/40 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3/40 border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-dimmed hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:text-font-color-white flex cursor-pointer items-center justify-center rounded-lg border px-2 py-0.5 text-sm transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable Single-Page Workspace */}
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
          {/* Progress Overlay during active apply operations */}
          {state.loading && state.step === 'applying' && (
            <AutoTagProgressOverlay
              stage={state.stage}
              message={state.progressMessage}
              progressPercent={state.progressPercent}
              onCancel={actions.cancel}
            />
          )}

          {/* Expandable Error UX Drawer */}
          {state.error && (
            <div className="bg-font-color-crimson/15 border-font-color-crimson/30 text-font-color-crimson flex flex-col gap-1.5 rounded-xl border p-3.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-font-color-crimson font-semibold">
                  Couldn't update metadata.
                </span>
                <button
                  type="button"
                  onClick={() => setShowErrorDetails((prev) => !prev)}
                  className="text-font-color-highlight dark:text-dark-font-color-highlight cursor-pointer border-0 bg-transparent text-xs font-semibold"
                >
                  {showErrorDetails ? '▲ Hide Details' : '▼ Details'}
                </button>
              </div>

              {showErrorDetails && (
                <div className="bg-background-color-1 dark:bg-dark-background-color-1 text-font-color-crimson border-font-color-crimson/20 overflow-x-auto rounded-lg border p-2.5 font-mono text-xs">
                  {state.error}
                </div>
              )}
            </div>
          )}

          {/* Success Banner */}
          {state.step === 'complete' && (
            <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/15 p-4">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🎉</span>
                <div>
                  <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    Metadata Applied Successfully!
                  </div>
                  <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs">
                    Updated {state.selectedTrackIds.size} songs with verified tags and artwork.
                  </div>
                </div>
              </div>

              {state.lastRestoredCount > 0 && (
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                  Restored {state.lastRestoredCount} songs.
                </span>
              )}
            </div>
          )}

          {/* 1. Search Criteria Bar (Collapsible) */}
          <SearchCriteriaBar
            album={state.searchAlbum}
            artist={state.searchArtist}
            totalTracks={state.searchTotalTracks}
            searchExpanded={state.searchExpanded}
            selectedSource={state.selectedSource}
            availableProviders={state.availableProviders}
            loading={state.loadingCandidates}
            onAlbumChange={actions.setSearchAlbum}
            onArtistChange={actions.setSearchArtist}
            onTotalTracksChange={actions.setSearchTotalTracks}
            onSourceChange={actions.setSelectedSource}
            onToggleExpanded={actions.toggleSearchExpanded}
            onSearch={() => actions.searchReleases()}
          />

          {/* 2. Candidate Matches Table */}
          <CandidateMatchesTable
            candidates={state.searchCandidates}
            selectedCandidateId={state.selectedCandidateId}
            loadingCandidateId={state.loadingCandidateId}
            loading={state.loadingCandidates}
            onSelectCandidate={(cand) => actions.selectCandidate(localSongs, cand)}
          />

          {/* 3. Selected Release Panel & Artwork */}
          {state.preview && (
            <div
              className={`transition-opacity duration-200 ${
                state.loadingPreview
                  ? 'pointer-events-none opacity-60'
                  : 'pointer-events-auto opacity-100'
              }`}
            >
              <SelectedReleasePanel
                preview={state.preview}
                artworkSource={state.artworkSource}
                replaceArtwork={state.replaceArtwork}
                onArtworkSourceChange={actions.setArtworkSource}
                onToggleReplaceArtwork={actions.setReplaceArtwork}
              />
            </div>
          )}

          {/* 4. Global Field Diff Table */}
          {state.preview && state.globalFieldDiffs.length > 0 && (
            <GlobalFieldDiffTable
              diffs={state.globalFieldDiffs}
              selectedFields={state.selectedGlobalFields}
              onToggleField={actions.toggleGlobalField}
              onSelectAll={actions.selectAllGlobalFields}
              onSelectChanged={actions.selectChangedGlobalFields}
              onClear={actions.clearGlobalFields}
            />
          )}

          {/* 5. Track Review: Compact View or Detailed Table */}
          {state.preview &&
            (viewMode === 'compact' ? (
              <CompactReviewView
                matches={state.filteredMatches}
                selectedTrackIds={state.selectedTrackIds}
                selectedFieldMap={state.selectedFieldMap}
                userEditedValues={state.userEditedValues}
                expandedTrackId={expandedTrackId}
                focusedTrackIndex={focusedTrackIndex}
                filter={state.filter}
                sort={state.sort}
                onToggleTrack={actions.toggleTrack}
                onToggleExpand={(id) => setExpandedTrackId((prev) => (prev === id ? null : id))}
                onOpenDetailed={handleOpenDetailed}
                onSelectAll={actions.selectAllTracks}
                onSelectChanged={actions.selectChangedTracks}
                onClearSelections={actions.clearTrackSelections}
                onFilterChange={actions.setFilter}
                onSortChange={actions.setSort}
                onToggleField={actions.toggleField}
              />
            ) : (
              <TrackComparisonTable
                matches={state.filteredMatches}
                selectedTrackIds={state.selectedTrackIds}
                selectedFieldMap={state.selectedFieldMap}
                userEditedValues={state.userEditedValues}
                expandedTrackId={expandedTrackId}
                filter={state.filter}
                sort={state.sort}
                onToggleTrack={actions.toggleTrack}
                onToggleField={actions.toggleField}
                onToggleExpand={(id) => setExpandedTrackId((prev) => (prev === id ? null : id))}
                onFieldChanged={actions.setFieldValue}
                onResetField={actions.resetFieldValue}
                onSelectAll={actions.selectAllTracks}
                onSelectChanged={actions.selectChangedTracks}
                onClearSelections={actions.clearTrackSelections}
                onFilterChange={actions.setFilter}
                onSortChange={actions.setSort}
              />
            ))}
        </div>

        {/* 6. Sticky Action Bar */}
        <AutoTagActionBar
          step={state.step}
          selectedTracksCount={state.selectedTracksCount}
          totalTracksCount={state.totalTracksCount}
          activeFieldsCount={state.activeFieldsCount}
          totalChanges={state.totalChanges}
          canUndo={state.canUndo}
          loading={state.loading}
          onCancel={handleClose}
          onApply={actions.applyPreview}
          onUndo={actions.undoLastAutoTag}
          onClose={handleClose}
        />
      </div>
    </div>,
    document.body
  );
};
