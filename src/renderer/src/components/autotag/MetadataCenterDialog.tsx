import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AutoTagSongInput } from '../../../../common/metadata/types';
import { useAlbumAutoTag } from '../../hooks/useAlbumAutoTag';
import { SearchCriteriaBar } from './SearchCriteriaBar';
import { CandidateMatchesTable } from './CandidateMatchesTable';
import { SelectedReleasePanel } from './SelectedReleasePanel';
import { GlobalFieldDiffTable } from './GlobalFieldDiffTable';
import { TrackComparisonTable } from './TrackComparisonTable';
import { AutoTagActionBar } from './AutoTagActionBar';
import { AutoTagProgressOverlay } from './AutoTagProgressOverlay';
import { ConfidenceBadge } from './ConfidenceBadge';

export interface MetadataCenterDialogProps {
  isOpen: boolean;
  localSongs: AutoTagSongInput[];
  initialAlbumName?: string;
  initialArtistName?: string;
  operationId?: string;
  onClose: () => void;
}

export const MetadataCenterDialog: React.FC<MetadataCenterDialogProps> = ({
  isOpen,
  localSongs,
  initialAlbumName = '',
  initialArtistName = '',
  operationId,
  onClose
}) => {
  const { state, actions } = useAlbumAutoTag(operationId, localSongs);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const previousFocusRef = useRef<Element | null>(null);

  // Focus preservation
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      setShowErrorDetails(false);

      // Seed search form with initial inputs
      if (initialAlbumName) actions.setSearchAlbum(initialAlbumName);
      if (initialArtistName) actions.setSearchArtist(initialArtistName);

      // Trigger initial release search if album title is provided
      if (initialAlbumName) {
        actions.searchReleases(initialAlbumName, initialArtistName);
      }
    }
  }, [isOpen, initialAlbumName, initialArtistName]);

  // Unified Close Handler with focus restoration
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

  // Keyboard Shortcuts (ESC to close, Ctrl+Enter to apply)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (state.preview && state.selectedTrackIds.size > 0 && !state.loading) {
          e.preventDefault();
          actions.applyPreview();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, state.preview, state.selectedTrackIds.size, state.loading]);

  if (!isOpen) return null;

  return createPortal(
    <div
      onClick={handleClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(10px)'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking modal container
        style={{
          width: '94%',
          maxWidth: '1080px',
          maxHeight: '92vh',
          background: 'rgba(18, 18, 24, 0.96)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '16px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.7)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: 'var(--text-color)'
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(255, 255, 255, 0.02)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.2rem' }}>✨</span>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-color-white)' }}>
                Metadata Center / AutoTag
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-color-dimmed)' }}>
                Search, compare and apply verified metadata
              </div>
            </div>
            {state.preview && (
              <ConfidenceBadge level={state.preview.confidenceLevel} confidence={state.preview.overallConfidence} />
            )}
          </div>

          <button
            type="button"
            onClick={handleClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-color-dimmed)',
              fontSize: '1.2rem',
              cursor: 'pointer',
              padding: '4px 8px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable Single-Page Workspace */}
        <div
          style={{
            padding: '20px 24px',
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}
        >
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
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: 'var(--text-color-crimson)',
                fontSize: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>Couldn't update metadata.</span>
                <button
                  type="button"
                  onClick={() => setShowErrorDetails((prev) => !prev)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-color-highlight)', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 500 }}
                >
                  {showErrorDetails ? '▲ Hide Details' : '▼ Details'}
                </button>
              </div>

              {showErrorDetails && (
                <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', background: 'rgba(0, 0, 0, 0.4)', padding: '8px 12px', borderRadius: '6px', overflowX: 'auto', color: 'var(--text-color-crimson)' }}>
                  {state.error}
                </div>
              )}
            </div>
          )}

          {/* Success Banner */}
          {state.step === 'complete' && (
            <div
              style={{
                padding: '14px 18px',
                borderRadius: '10px',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.4rem' }}>🎉</span>
                <div>
                  <div style={{ fontWeight: 600, color: '#34d399', fontSize: '0.92rem' }}>
                    Metadata Applied Successfully!
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-color-dimmed)' }}>
                    Updated {state.selectedTrackIds.size} songs with verified tags and artwork.
                  </div>
                </div>
              </div>

              {state.lastRestoredCount > 0 && (
                <span style={{ fontSize: '0.8rem', color: '#fbbf24' }}>
                  Restored {state.lastRestoredCount} songs.
                </span>
              )}
            </div>
          )}

          {/* 1. Search Criteria Bar (Collapsible) */}
          <SearchCriteriaBar
            album={state.searchAlbum}
            artist={state.searchArtist}
            trackNo={state.searchTrackNo}
            discNo={state.searchDiscNo}
            totalTracks={state.searchTotalTracks}
            selectedProvider={state.selectedProvider}
            searchExpanded={state.searchExpanded}
            loading={state.loadingCandidates}
            onAlbumChange={actions.setSearchAlbum}
            onArtistChange={actions.setSearchArtist}
            onTrackNoChange={actions.setSearchTrackNo}
            onDiscNoChange={actions.setSearchDiscNo}
            onTotalTracksChange={actions.setSearchTotalTracks}
            onProviderChange={actions.setSelectedProvider}
            onToggleExpanded={actions.toggleSearchExpanded}
            onSearch={() => actions.searchReleases()}
          />

          {/* 2. Candidate Matches Table */}
          <CandidateMatchesTable
            candidates={state.searchCandidates}
            selectedCandidateId={state.selectedCandidateId}
            loading={state.loadingCandidates}
            onSelectCandidate={(cand) => actions.selectCandidate(localSongs, cand)}
          />

          {/* 3. Selected Release Panel & Artwork */}
          {state.preview && (
            <SelectedReleasePanel
              preview={state.preview}
              artworkSource={state.artworkSource}
              replaceArtwork={state.replaceArtwork}
              onArtworkSourceChange={actions.setArtworkSource}
              onToggleReplaceArtwork={actions.setReplaceArtwork}
            />
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

          {/* 5. Track-by-Track Comparison Table */}
          {state.preview && (
            <TrackComparisonTable
              matches={state.filteredMatches}
              selectedTrackIds={state.selectedTrackIds}
              selectedFieldMap={state.selectedFieldMap}
              userEditedValues={state.userEditedValues}
              filter={state.filter}
              sort={state.sort}
              onToggleTrack={actions.toggleTrack}
              onToggleField={actions.toggleField}
              onFieldChanged={actions.setFieldValue}
              onResetField={actions.resetFieldValue}
              onSelectAll={actions.selectAllTracks}
              onSelectChanged={actions.selectChangedTracks}
              onClearSelections={actions.clearTrackSelections}
              onFilterChange={actions.setFilter}
              onSortChange={actions.setSort}
            />
          )}
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
