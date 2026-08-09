import React from 'react';
import type { AutoTagStage } from '../../../../common/metadata/types';

export interface AutoTagProgressOverlayProps {
  stage: AutoTagStage;
  message: string;
  progressPercent: number;
  onCancel?: () => void;
}

export const AutoTagProgressOverlay: React.FC<AutoTagProgressOverlayProps> = ({
  stage,
  message,
  progressPercent,
  onCancel
}) => {
  const getStageTitle = () => {
    switch (stage) {
      case 'searching':
        return 'Searching Release Candidates...';
      case 'resolving':
        return 'Resolving Release Tracklist...';
      case 'matching':
        return 'Matching Local Tracks...';
      case 'diffing':
        return 'Building Metadata Diffs...';
      case 'applying':
        return 'Applying Metadata Updates...';
      case 'completed':
        return 'Operation Completed';
      case 'cancelled':
        return 'Operation Cancelled';
      case 'failed':
        return 'Operation Failed';
      default:
        return 'Processing...';
    }
  };

  return (
    <div
      style={{
        padding: '20px',
        borderRadius: '12px',
        backgroundColor: 'rgba(18, 18, 24, 0.85)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        color: '#f3f4f6',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{getStageTitle()}</span>
        <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>{Math.round(progressPercent)}%</span>
      </div>

      <div
        style={{
          width: '100%',
          height: '8px',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '4px',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${Math.min(100, Math.max(0, progressPercent))}%`,
            background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
            borderRadius: '4px',
            transition: 'width 0.3s ease'
          }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>{message}</span>
        {onCancel && stage !== 'completed' && stage !== 'cancelled' && (
          <button
            onClick={onCancel}
            style={{
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#f87171',
              borderRadius: '6px',
              padding: '4px 12px',
              fontSize: '0.78rem',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};
