import React from 'react';

export interface ProgressOverlayProps {
  stage: string;
  message: string;
  progressPercent: number;
}

export const ProgressOverlay: React.FC<ProgressOverlayProps> = ({
  stage,
  message,
  progressPercent
}) => {
  if (stage === 'idle' || stage === 'completed') return null;

  return (
    <div
      style={{
        padding: '12px 18px',
        borderRadius: '10px',
        background: 'rgba(56, 189, 248, 0.1)',
        border: '1px solid rgba(56, 189, 248, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '13px'
        }}
      >
        <span
          style={{
            color: 'var(--text-color-highlight)',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span
            className="material-symbols-rounded"
            style={{ fontSize: '18px', animation: 'spin 1.5s linear infinite' }}
          >
            sync
          </span>
          <span>{message || 'Processing metadata...'}</span>
        </span>
        <span style={{ color: 'var(--text-color-highlight)', fontWeight: 700 }}>
          {Math.round(progressPercent)}%
        </span>
      </div>

      <div
        style={{
          height: '6px',
          borderRadius: '3px',
          background: 'rgba(15, 23, 42, 0.6)',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progressPercent}%`,
            background: 'linear-gradient(90deg, #38BDF8 0%, #3B82F6 100%)',
            borderRadius: '3px',
            transition: 'width 0.2s ease'
          }}
        />
      </div>
    </div>
  );
};
