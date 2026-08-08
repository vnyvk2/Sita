import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMetadataWorkflow, type WorkflowType } from '../../hooks/useMetadataWorkflow';
import { WorkflowTabs } from './WorkflowTabs';
import { SearchAndProviderPanel } from './SearchAndProviderPanel';
import { CandidateList } from './CandidateList';
import { AlbumSummaryCard } from './AlbumSummaryCard';
import { MetadataDiffPanel } from './MetadataDiffPanel';
import { TrackTable } from './TrackTable';
import { ProgressOverlay } from './ProgressOverlay';
import { StickyFooter } from './StickyFooter';
import styles from './MetadataCenter.module.css';

export interface MetadataCenterDialogProps {
  isOpen: boolean;
  localSongs: any[];
  initialAlbumName?: string;
  initialArtistName?: string;
  initialWorkflow?: WorkflowType;
  operationId?: string;
  onClose: () => void;
}

export const MetadataCenterDialog: React.FC<MetadataCenterDialogProps> = ({
  isOpen,
  localSongs,
  initialAlbumName = '',
  initialArtistName = '',
  initialWorkflow = 'album',
  operationId,
  onClose
}) => {
  const previousFocusRef = useRef<Element | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>('auto');

  const { state, actions } = useMetadataWorkflow({
    initialWorkflow,
    initialAlbumName,
    initialArtistName,
    operationId
  });

  // Preserve focus on open
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
    }
  }, [isOpen]);

  const handleClose = () => {
    onClose();
    requestAnimationFrame(() => {
      const prev = previousFocusRef.current;
      if (prev instanceof HTMLElement && document.contains(prev)) {
        prev.focus();
      }
    });
  };

  // Keyboard accessibility (Esc key)
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
    if (isOpen && (initialAlbumName || initialArtistName)) {
      actions.search({
        title: initialAlbumName,
        artist: initialArtistName,
        album: initialAlbumName
      });
    }
  }, [isOpen, initialAlbumName, initialArtistName]);

  // Handle candidate selection & re-diffing
  const handleSelectCandidate = (candidateId: string, providerId: string) => {
    actions.setSelectedCandidateId(candidateId);
    actions.buildPreview(localSongs, candidateId, providerId);
  };

  // Handle provider pill click (instant re-diff using active candidate)
  const handleProviderChange = (providerId: string) => {
    setSelectedProvider(providerId);
    if (state.selectedCandidateId) {
      actions.buildPreview(localSongs, state.selectedCandidateId, providerId === 'auto' ? undefined : providerId);
    }
  };

  if (!isOpen) return null;

  const activeCandidate = state.candidates.find((c) => c.id === state.selectedCandidateId) || state.preview?.primaryCandidate;
  const sampleMatch = state.preview?.matches?.[0];
  const fieldDiffs = sampleMatch?.fieldDiffs || [];

  return createPortal(
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header Workspace */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <h2>
              <span className="material-symbols-rounded" style={{ color: '#38BDF8', fontSize: '24px' }}>
                auto_fix_high
              </span>
              <span>Metadata Center</span>
            </h2>
            <div className={styles.titleSubtitle}>
              MusicBee-Redesigned Granular Metadata Workspace
            </div>
          </div>

          <button onClick={handleClose} className={styles.closeButton}>
            <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>
              close
            </span>
          </button>
        </div>

        {/* Workflow Tabs */}
        <WorkflowTabs
          activeTab={state.workflowType}
          onTabChange={(tab) => {
            actions.setWorkflowType(tab);
            actions.search(state.query);
          }}
        />

        {/* Scrollable Content Body */}
        <div className={styles.bodyContent}>
          {/* Section 1: Unified Search & Provider Control Bar */}
          <SearchAndProviderPanel
            title={state.query.title}
            artist={state.query.artist}
            selectedProvider={selectedProvider}
            loading={state.loading}
            onTitleChange={(val) => actions.setQuery({ ...state.query, title: val, album: val })}
            onArtistChange={(val) => actions.setQuery({ ...state.query, artist: val })}
            onProviderChange={handleProviderChange}
            onSearch={() => actions.search(state.query)}
          />

          {/* Live Real-time Progress Overlay */}
          <ProgressOverlay
            stage={state.stage}
            message={state.progressMessage}
            progressPercent={state.progressPercent}
          />

          {/* Error Banner */}
          {state.error && (
            <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#F87171', fontSize: '13px' }}>
              {state.error}
            </div>
          )}

          {/* Section 2: Release Candidates List */}
          <CandidateList
            candidates={state.candidates}
            selectedId={state.selectedCandidateId}
            onSelect={handleSelectCandidate}
          />

          {/* Section 3: Split Workspace Grid (LEFT: Overview + Diffs | RIGHT: Track Table) */}
          {state.preview && (
            <div className={styles.previewWorkspaceGrid}>
              {/* LEFT COLUMN: Overview & Category Field Diffs */}
              <div className={styles.leftWorkspace}>
                {activeCandidate && (
                  <AlbumSummaryCard
                    candidate={activeCandidate}
                    trackCount={state.preview?.matches?.length ?? 0}
                  />
                )}

                <MetadataDiffPanel
                  fieldDiffs={fieldDiffs}
                  selectedFieldIds={state.selectedFieldIds}
                  onToggleField={actions.toggleField}
                />
              </div>

              {/* RIGHT COLUMN: Filterable Git-Diff Track Table */}
              <div className={styles.rightWorkspace}>
                <TrackTable
                  matches={state.preview.matches || []}
                  selectedTrackIds={state.selectedTrackIds}
                  onToggleTrack={actions.toggleTrack}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Workspace */}
        <StickyFooter
          matchCount={state.preview?.matches?.length ?? 0}
          selectedFieldCount={state.selectedFieldIds.size}
          selectedTrackCount={state.selectedTrackIds.size}
          canUndo={state.canUndo}
          loading={state.loading}
          onCancel={handleClose}
          onApply={async () => {
            const success = await actions.apply();
            if (success) {
              handleClose();
            }
          }}
          onUndo={actions.undo}
        />
      </div>
    </div>,
    document.body
  );
};
