import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMetadataWorkflow, type WorkflowType } from '../../hooks/useMetadataWorkflow';
import { WorkflowTabs } from './WorkflowTabs';
import { CandidateList } from './CandidateList';
import { MetadataDiffPanel } from './MetadataDiffPanel';
import { TrackTable } from './TrackTable';
import { StickyFooter } from './StickyFooter';

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

  const { state, actions } = useMetadataWorkflow({
    initialWorkflow,
    initialAlbumName,
    initialArtistName,
    operationId
  });

  // Preserve focus
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

  // When candidate selection changes, build preview
  const handleSelectCandidate = (candidateId: string, providerId: string) => {
    actions.setSelectedCandidateId(candidateId);
    actions.buildPreview(localSongs, candidateId, providerId);
  };

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
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(12px)'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '900px',
          maxWidth: '92vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#FFF' }}>
              Metadata Center
            </h2>
            <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
              MusicBee-Inspired Granular Metadata Management
            </span>
          </div>

          <button
            onClick={handleClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: '20px',
              cursor: 'pointer'
            }}
          >
            ✕
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

        {/* Modal Content Scroll Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Search Inputs */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Album / Title..."
              value={state.query.title}
              onChange={(e) => actions.setQuery({ ...state.query, title: e.target.value, album: e.target.value })}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '6px',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#FFF',
                fontSize: '13px'
              }}
            />
            <input
              type="text"
              placeholder="Artist..."
              value={state.query.artist}
              onChange={(e) => actions.setQuery({ ...state.query, artist: e.target.value })}
              style={{
                width: '200px',
                padding: '10px 14px',
                borderRadius: '6px',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#FFF',
                fontSize: '13px'
              }}
            />
            <button
              onClick={() => actions.search(state.query)}
              disabled={state.loading}
              style={{
                padding: '10px 20px',
                borderRadius: '6px',
                background: '#3B82F6',
                color: '#FFF',
                border: 'none',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              {state.loading ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Error Banner */}
          {state.error && (
            <div style={{ padding: '10px 14px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.2)', color: '#F87171', fontSize: '13px' }}>
              {state.error}
            </div>
          )}

          {/* Section 1: Search Results Candidates */}
          <CandidateList
            candidates={state.candidates}
            selectedId={state.selectedCandidateId}
            onSelect={handleSelectCandidate}
          />

          {/* Section 2: Selective Metadata Diffs */}
          {state.preview && (
            <MetadataDiffPanel
              supportedFields={state.preview.supportedFields || []}
              selectedFieldIds={state.selectedFieldIds}
              onToggleField={actions.toggleField}
              matches={state.preview.matches || []}
            />
          )}

          {/* Section 3: Track Preview Table */}
          {state.preview && (
            <TrackTable
              matches={state.preview.matches || []}
              selectedTrackIds={state.selectedTrackIds}
              onToggleTrack={actions.toggleTrack}
            />
          )}
        </div>

        {/* Sticky Footer */}
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
