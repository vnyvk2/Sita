import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAlbumAutoTag } from '../../hooks/useAlbumAutoTag';
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
  }, [isOpen, state.preview, state.filteredMatches, focusedTrackIndex, state.selectedTrackIds.size, state.loading, viewMode]);

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
        background: 'rgba(4, 7, 13, 0.82)',
        backdropFilter: 'blur(16px)'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '95%',
          maxWidth: '1120px',
          maxHeight: '95vh',
          background: 'linear-gradient(145deg, #0F172A 0%, #0B0F19 100%)',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          borderRadius: '16px',
          boxShadow: '0 30px 70px rgba(0,0,0,0.8), 0 0 40px rgba(59, 130, 246, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#FFFFFF'
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            background: 'rgba(15, 23, 42, 0.6)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.3rem' }}>✨</span>
            <div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
                Metadata Center / AutoTag
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginTop: '2px' }}>
                Search, compare and apply verified metadata
              </div>
            </div>
            {state.preview && (
              <ConfidenceBadge level={state.preview.confidenceLevel} confidence={state.preview.overallConfidence} />
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* View Mode Toggle Pill (Compact vs Detailed) */}
            {state.preview && (
              <div
                style={{
                  display: 'flex',
                  background: 'rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  padding: '3px',
                  border: '1px solid rgba(255, 255, 255, 0.14)'
                }}
              >
                <button
                  type="button"
                  onClick={() => setViewMode('compact')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: viewMode === 'compact' ? 'rgba(59, 130, 246, 0.35)' : 'transparent',
                    color: viewMode === 'compact' ? '#FFFFFF' : '#94A3B8',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>⊞</span>
                  <span>Compact</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('detailed')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: viewMode === 'detailed' ? 'rgba(59, 130, 246, 0.35)' : 'transparent',
                    color: viewMode === 'detailed' ? '#FFFFFF' : '#94A3B8',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>☷</span>
                  <span>Detailed</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleClose}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '6px',
                color: '#CBD5E1',
                fontSize: '1.1rem',
                cursor: 'pointer',
                padding: '4px 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ✕
            </button>
          </div>
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
                background: 'rgba(239, 68, 68, 0.18)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#FCA5A5',
                fontSize: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, color: '#FECACA' }}>Couldn't update metadata.</span>
                <button
                  type="button"
                  onClick={() => setShowErrorDetails((prev) => !prev)}
                  style={{ background: 'transparent', border: 'none', color: '#60A5FA', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}
                >
                  {showErrorDetails ? '▲ Hide Details' : '▼ Details'}
                </button>
              </div>

              {showErrorDetails && (
                <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', background: 'rgba(0, 0, 0, 0.5)', padding: '8px 12px', borderRadius: '6px', overflowX: 'auto', color: '#F87171' }}>
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
                background: 'rgba(16, 185, 129, 0.18)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.4rem' }}>🎉</span>
                <div>
                  <div style={{ fontWeight: 700, color: '#34D399', fontSize: '0.94rem' }}>
                    Metadata Applied Successfully!
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#CBD5E1' }}>
                    Updated {state.selectedTrackIds.size} songs with verified tags and artwork.
                  </div>
                </div>
              </div>

              {state.lastRestoredCount > 0 && (
                <span style={{ fontSize: '0.82rem', color: '#FBBF24', fontWeight: 600 }}>
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

          {/* 5. Track Review: Compact View or Detailed Table */}
          {state.preview && (
            viewMode === 'compact' ? (
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
            )
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
