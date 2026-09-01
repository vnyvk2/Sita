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
  const dynamicApplyLabel =
    selectedTrackCount > 0
      ? `Update ${selectedTrackCount} Song${selectedTrackCount > 1 ? 's' : ''}`
      : 'Apply Metadata';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        background: 'rgba(15, 23, 42, 0.95)',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(16px)',
        borderBottomLeftRadius: '16px',
        borderBottomRightRadius: '16px'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          fontSize: '13px',
          color: 'var(--text-color-dimmed)'
        }}
      >
        <span>
          <strong style={{ color: 'var(--text-color)' }}>{selectedTrackCount}</strong> /{' '}
          {matchCount} tracks selected
        </span>
        <span>•</span>
        <span>
          <strong style={{ color: 'var(--text-color-highlight)' }}>{selectedFieldCount}</strong>{' '}
          fields active
        </span>

        {canUndo && (
          <>
            <span>•</span>
            <button
              onClick={onUndo}
              disabled={loading}
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                color: 'var(--text-color-crimson)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                padding: '5px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span className="material-symbols-rounded" style={{ fontSize: '14px' }}>
                undo
              </span>
              <span>Undo Available</span>
            </button>
          </>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={onCancel}
          disabled={loading}
          style={{
            padding: '9px 20px',
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--text-color-dimmed)',
            background: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>

        <button
          onClick={onApply}
          disabled={loading || matchCount === 0}
          style={{
            padding: '9px 24px',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-color-white)',
            background: loading
              ? 'rgba(59, 130, 246, 0.4)'
              : 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
            border: 'none',
            borderRadius: '8px',
            cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 16px rgba(16, 185, 129, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>
            {loading ? 'sync' : 'check'}
          </span>
          <span>{loading ? 'Applying...' : dynamicApplyLabel}</span>
        </button>
      </div>
    </div>
  );
};
