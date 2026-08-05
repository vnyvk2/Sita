import React from 'react';
import type { ConfidenceLevel } from '../../../common/metadata/types';

export interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  confidence?: number;
}

export const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({ level, confidence }) => {
  const getBadgeStyle = () => {
    switch (level) {
      case 'Excellent':
      case 'Very Good':
        return {
          bg: 'rgba(16, 185, 129, 0.15)',
          border: 'rgba(16, 185, 129, 0.4)',
          text: '#34d399',
          iconColor: '#10b981'
        };
      case 'Good':
        return {
          bg: 'rgba(59, 130, 246, 0.15)',
          border: 'rgba(59, 130, 246, 0.4)',
          text: '#60a5fa',
          iconColor: '#3b82f6'
        };
      case 'Review':
        return {
          bg: 'rgba(245, 158, 11, 0.15)',
          border: 'rgba(245, 158, 11, 0.4)',
          text: '#fbbf24',
          iconColor: '#f59e0b'
        };
      case 'Poor':
      default:
        return {
          bg: 'rgba(239, 68, 68, 0.15)',
          border: 'rgba(239, 68, 68, 0.4)',
          text: '#f87171',
          iconColor: '#ef4444'
        };
    }
  };

  const style = getBadgeStyle();
  const percentText = confidence !== undefined ? `${Math.round(confidence * 100)}%` : '';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 10px',
        borderRadius: '12px',
        fontSize: '0.78rem',
        fontWeight: 600,
        backgroundColor: style.bg,
        border: `1px solid ${style.border}`,
        color: style.text,
        userSelect: 'none'
      }}
    >
      <svg width="8" height="8" viewBox="0 0 8 8">
        <circle cx="4" cy="4" r="4" fill={style.iconColor} />
      </svg>
      <span>{level}</span>
      {percentText && <span style={{ opacity: 0.8, fontSize: '0.72rem' }}>({percentText})</span>}
    </span>
  );
};
