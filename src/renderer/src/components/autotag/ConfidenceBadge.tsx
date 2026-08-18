import React from 'react';
import type { ConfidenceLevel } from '../../../../common/metadata/types';

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
          bg: 'rgba(16, 185, 129, 0.2)',
          border: 'rgba(16, 185, 129, 0.45)',
          text: '#34D399',
          iconColor: '#10B981'
        };
      case 'Good':
        return {
          bg: 'rgba(59, 130, 246, 0.2)',
          border: 'rgba(59, 130, 246, 0.45)',
          text: '#60A5FA',
          iconColor: '#3B82F6'
        };
      case 'Review':
        return {
          bg: 'rgba(245, 158, 11, 0.2)',
          border: 'rgba(245, 158, 11, 0.45)',
          text: '#FBBF24',
          iconColor: '#F59E0B'
        };
      case 'Poor':
      default:
        return {
          bg: 'rgba(239, 68, 68, 0.2)',
          border: 'rgba(239, 68, 68, 0.45)',
          text: '#EF4444',
          iconColor: '#DC2626'
        };
    }
  };

  const style = getBadgeStyle();
  const percentText = confidence !== undefined ? ` (${Math.round(confidence * 100)}%)` : '';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 10px',
        borderRadius: '12px',
        fontSize: '0.78rem',
        fontWeight: 700,
        backgroundColor: style.bg,
        border: `1px solid ${style.border}`,
        color: style.text,
        letterSpacing: '0.01em'
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: style.iconColor
        }}
      />
      {level}
      {percentText}
    </span>
  );
};
