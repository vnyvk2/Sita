import React from 'react';
import type { ConfidenceLevel } from '../../../../common/metadata/types';

export interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  confidence?: number;
}

export const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({ level, confidence }) => {
  const getBadgeClass = () => {
    switch (level) {
      case 'Excellent':
      case 'Very Good':
        return 'bg-font-color-highlight/15 dark:bg-dark-font-color-highlight/15 border-font-color-highlight/30 dark:border-dark-font-color-highlight/30 text-font-color-highlight dark:text-dark-font-color-highlight';
      case 'Good':
        return 'bg-background-color-3/30 dark:bg-dark-background-color-3/30 border-background-color-3/60 dark:border-dark-background-color-3/60 text-font-color-highlight dark:text-dark-font-color-highlight';
      case 'Review':
        return 'bg-background-color-2 dark:bg-dark-background-color-2 border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-dimmed dark:text-dark-font-color-dimmed';
      case 'Poor':
      default:
        return 'bg-font-color-crimson/15 border-font-color-crimson/30 text-font-color-crimson';
    }
  };

  const getDotClass = () => {
    switch (level) {
      case 'Excellent':
      case 'Very Good':
        return 'bg-font-color-highlight dark:bg-dark-font-color-highlight';
      case 'Good':
        return 'bg-font-color-highlight dark:bg-dark-font-color-highlight';
      case 'Review':
        return 'bg-font-color-dimmed dark:text-dark-font-color-dimmed';
      case 'Poor':
      default:
        return 'bg-font-color-crimson';
    }
  };

  const percentText = confidence !== undefined ? ` (${Math.round(confidence * 100)}%)` : '';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border tracking-wide ${getBadgeClass()}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${getDotClass()}`} />
      {level}
      {percentText}
    </span>
  );
};

