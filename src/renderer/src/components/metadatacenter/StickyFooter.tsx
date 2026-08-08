import React from 'react';

export interface StickyFooterProps {
  matchCount: number;
  selectedFieldCount: number;
  selectedTrackCount: number;
  canUndo: boolean;
  loading: boolean;
  onCancel: () => void;
  onApply: () => void;
  onUndo: () => void;
}

export const StickyFooter: React.FC<StickyFooterProps> = ({
  matchCount,
  selectedFieldCount,
  selectedTrackCount,
  canUndo,
  loading,
  onCancel,
  onApply,
  onUndo
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 24px',
        background: 'rgba(15, 23, 42, 0.95)',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(12px)',
        borderBottomLeftRadius: '12px',
        borderBottomRightRadius: '12px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)' }}>
        <span>
          <strong style={{ color: '#FFF' }}>{selectedTrackCount}</strong> / {matchCount} tracks selected
        </span>
        <span>•</span>
        <span>
          <strong style={{ color: '#60A5FA' }}>{selectedFieldCount}</strong> fields active
        </span>

        {canUndo && (
          <>
            <span>•</span>
            <button
              onClick={onUndo}
              disabled={loading}
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#F87171',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              ↺ Undo Available
            </button>
          </>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={onCancel}
          disabled={loading}
          style={{
            padding: '8px 18px',
            fontSize: '13px',
            fontWeight: 500,
            color: 'rgba(255, 255, 255, 0.7)',
            background: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>

        <button
          onClick={onApply}
          disabled={loading || matchCount === 0}
          style={{
            padding: '8px 22px',
            fontSize: '13px',
            fontWeight: 600,
            color: '#FFF',
            background: loading ? 'rgba(96, 165, 250, 0.4)' : '#3B82F6',
            border: 'none',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
          }}
        >
          {loading ? 'Applying...' : 'Apply Changes'}
        </button>
      </div>
    </div>
  );
};
