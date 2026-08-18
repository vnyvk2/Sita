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
        padding: '14px 24px',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'rgba(15, 15, 22, 0.95)',
        backdropFilter: 'blur(10px)'
      }}
    >
      {/* Metrics Summary & Undo Link */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.82rem', color: 'var(--text-color-dimmed)' }}>
        {totalTracksCount > 0 && (
          <>
            <span style={{ color: selectedTracksCount > 0 ? 'var(--text-color-white)' : 'inherit', fontWeight: 500 }}>
              ✓ {selectedTracksCount} / {totalTracksCount} tracks
            </span>
            <span>•</span>
            <span>{activeFieldsCount} fields active</span>
            <span>•</span>
            <span style={{ color: totalChanges > 0 ? '#60a5fa' : 'inherit', fontWeight: 600 }}>
              {totalChanges} changes
            </span>
          </>
        )}

        {canUndo && (
          <>
            <span>•</span>
            <button
              type="button"
              onClick={onUndo}
              disabled={loading}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#ef4444',
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
            padding: '8px 16px',
            borderRadius: '6px',
            background: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: 'var(--text-color-white)',
            fontSize: '0.85rem',
            cursor: 'pointer',
            fontWeight: 500
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
              padding: '8px 22px',
              borderRadius: '6px',
              background:
                selectedTracksCount === 0 || totalChanges === 0 || loading
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'linear-gradient(135deg, #10b981, #059669)',
              border: 'none',
              color: 'var(--text-color-white)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: selectedTracksCount === 0 || totalChanges === 0 || loading ? 'not-allowed' : 'pointer',
              opacity: selectedTracksCount === 0 || totalChanges === 0 || loading ? 0.4 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
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
