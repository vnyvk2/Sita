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
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 24px',
        borderTop: '1px solid rgba(255, 255, 255, 0.12)',
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(12px)'
      }}
    >
      {/* Metrics Summary & Undo Link */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.85rem', color: '#94A3B8' }}>
        {totalTracksCount > 0 && (
          <>
            <span style={{ color: selectedTracksCount > 0 ? '#FFFFFF' : '#94A3B8', fontWeight: 600 }}>
              ✓ {selectedTracksCount} / {totalTracksCount} tracks
            </span>
            <span style={{ color: '#64748B' }}>•</span>
            <span style={{ color: '#CBD5E1' }}>{activeFieldsCount} fields active</span>
            <span style={{ color: '#64748B' }}>•</span>
            <span style={{ color: totalChanges > 0 ? '#38BDF8' : '#94A3B8', fontWeight: 700 }}>
              {totalChanges} changes
            </span>
          </>
        )}

        {canUndo && (
          <>
            <span style={{ color: '#64748B' }}>•</span>
            <button
              type="button"
              onClick={onUndo}
              disabled={loading}
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '4px',
                padding: '2px 8px',
                color: '#EF4444',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              ↶ Undo available
            </button>
          </>
        )}
      </div>

      {/* Primary Action Buttons */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <button
          type="button"
          onClick={step === 'complete' ? onClose : onCancel}
          style={{
            padding: '9px 18px',
            borderRadius: '7px',
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            color: '#F8FAFC',
            fontSize: '0.88rem',
            cursor: 'pointer',
            fontWeight: 600
          }}
        >
          {step === 'complete' ? 'Close' : 'Cancel'}
        </button>

        {step !== 'complete' && (
          <button
            type="button"
            onClick={onApply}
            disabled={selectedTracksCount === 0 || totalChanges === 0 || loading}
            style={{
              padding: '9px 24px',
              borderRadius: '7px',
              background:
                selectedTracksCount === 0 || totalChanges === 0 || loading
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'linear-gradient(135deg, #10B981, #059669)',
              border: 'none',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '0.88rem',
              cursor: selectedTracksCount === 0 || totalChanges === 0 || loading ? 'not-allowed' : 'pointer',
              opacity: selectedTracksCount === 0 || totalChanges === 0 || loading ? 0.4 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: selectedTracksCount === 0 || totalChanges === 0 || loading ? 'none' : '0 4px 14px rgba(16, 185, 129, 0.35)',
              transition: 'all 0.15s ease'
            }}
          >
            {loading
              ? 'Applying Changes...'
              : `✓ Apply ${totalChanges} Changes`}
          </button>
        )}
      </div>
    </div>
  );
};
