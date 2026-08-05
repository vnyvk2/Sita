import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAlbumAutoTag } from '../../hooks/useAlbumAutoTag';
import { ReleaseSearchPanel } from './ReleaseSearchPanel';
import { AutoTagPreviewTable } from './AutoTagPreviewTable';
import { AutoTagProgressOverlay } from './AutoTagProgressOverlay';
import { ConfidenceBadge } from './ConfidenceBadge';
import { FinalReviewSummaryCard } from './FinalReviewSummaryCard';

export interface AlbumAutoTagDialogProps {
  isOpen: boolean;
  localSongs: any[];
  initialAlbumName?: string;
  initialArtistName?: string;
  operationId?: string;
  onClose: () => void;
}

export const AlbumAutoTagDialog: React.FC<AlbumAutoTagDialogProps> = ({
  isOpen,
  localSongs,
  initialAlbumName = '',
  initialArtistName = '',
  operationId,
  onClose
}) => {
  const { state, actions } = useAlbumAutoTag(operationId);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [replaceArtwork] = useState(true);
  const previousFocusRef = useRef<Element | null>(null);

  // Focus preservation
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      setShowErrorDetails(false);
    }
  }, [isOpen]);

  // Unified Close Handler with requestAnimationFrame focus restoration
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

  // Keyboard Accessibility (ESC key close)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Initial search trigger on open
  useEffect(() => {
    if (isOpen && initialAlbumName) {
      actions.searchReleases(initialAlbumName, initialArtistName);
    }
  }, [isOpen, initialAlbumName, initialArtistName]);

  if (!isOpen) return null;

  const selectedMatches = state.filteredMatches.filter((m) => state.selectedTrackIds.has(m.localSongId));

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
        onClick={(e) => e.stopPropagation()} // Prevent backdrop close when clicking modal body
        style={{
          width: '90%',
          maxWidth: '960px',
          maxHeight: '90vh',
          background: 'rgba(20, 20, 28, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '16px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#f3f4f6'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff' }}>Album Auto-Tagger</span>
            {state.preview && <ConfidenceBadge level={state.preview.confidenceLevel} confidence={state.preview.overallConfidence} />}
          </div>
          <button
            onClick={handleClose}
            style={{ background: 'transparent', border: 'none', color: '#9ca3af', fontSize: '1.2rem', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Progress Overlay during active operations */}
          {state.loading && (
            <AutoTagProgressOverlay
              stage={state.stage}
              message={state.progressMessage}
              progressPercent={state.progressPercent}
              onCancel={actions.cancel}
            />
          )}

          {/* Expandable Error UX Drawer */}
          {state.error && (
            <div style={{ padding: '14px 16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', fontSize: '0.88rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>Couldn't update metadata.</span>
                <button
                  onClick={() => setShowErrorDetails((prev) => !prev)}
                  style={{ background: 'transparent', border: 'none', color: '#60a5fa', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 500 }}
                >
                  {showErrorDetails ? '▲ Hide Details' : '▼ Details'}
                </button>
              </div>

              {showErrorDetails && (
                <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', background: 'rgba(0, 0, 0, 0.4)', padding: '8px 12px', borderRadius: '6px', overflowX: 'auto', color: '#fca5a5' }}>
                  {state.error}
                </div>
              )}
            </div>
          )}

          {/* Step 1: Search Releases */}
          {state.step === 'search' && (
            <ReleaseSearchPanel
              initialAlbumName={initialAlbumName}
              initialArtistName={initialArtistName}
              candidates={state.searchCandidates}
              loading={state.loading}
              onSearch={actions.searchReleases}
              onSelectRelease={(releaseId, provider) => actions.buildPreview(localSongs, releaseId, provider as any)}
            />
          )}

          {/* Step 2: Preview, Summary & Diff Table */}
          {state.step === 'preview' && state.preview && (
            <>
              <FinalReviewSummaryCard
                preview={state.preview}
                selectedMatches={selectedMatches}
                replaceArtwork={replaceArtwork}
              />

              <AutoTagPreviewTable
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
            </>
          )}

          {/* Step 3: Complete & Undo Snackbar */}
          {state.step === 'complete' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', gap: '16px' }}>
              <div style={{ fontSize: '3rem' }}>🎉</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 600, color: '#34d399' }}>Metadata Applied Successfully!</div>
              <div style={{ opacity: 0.8, fontSize: '0.9rem' }}>Updated {state.selectedTrackIds.size} tracks with verified ID3 tags.</div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                {state.canUndo && (
                  <button
                    onClick={actions.undoLastAutoTag}
                    style={{ padding: '10px 20px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#f87171', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Undo Last AutoTag
                  </button>
                )}
                <button
                  onClick={handleClose}
                  style={{ padding: '10px 24px', borderRadius: '8px', background: 'linear-gradient(135deg, #3b82f6, #6366f1)', border: 'none', color: '#ffffff', fontWeight: 600, cursor: 'pointer' }}
                >
                  Done
                </button>
              </div>

              {state.lastRestoredCount > 0 && (
                <div style={{ fontSize: '0.85rem', color: '#fbbf24', marginTop: '8px' }}>
                  Restored original tags for {state.lastRestoredCount} songs.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {state.step === 'preview' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)' }}>
            <button
              onClick={actions.reset}
              style={{ padding: '8px 16px', borderRadius: '6px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#ffffff', fontSize: '0.85rem', cursor: 'pointer' }}
            >
              ← Back to Search
            </button>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleClose}
                style={{ padding: '8px 16px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#ffffff', fontSize: '0.85rem', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={actions.applyPreview}
                disabled={state.selectedTrackIds.size === 0 || state.loading}
                style={{
                  padding: '8px 20px',
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  border: 'none',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: state.selectedTrackIds.size === 0 || state.loading ? 'not-allowed' : 'pointer',
                  opacity: state.selectedTrackIds.size === 0 || state.loading ? 0.5 : 1
                }}
              >
                Apply Tags ({state.selectedTrackIds.size} Selected)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
