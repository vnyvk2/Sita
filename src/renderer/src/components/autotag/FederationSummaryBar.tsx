import React from 'react';
import type { AlbumTagPreview } from '../../../../common/metadata/types';
import { computeFederationSummary } from './utils/previewSummary';

export interface FederationSummaryBarProps {
  preview: AlbumTagPreview;
  artworkSource?: string;
  className?: string;
}

export const FederationSummaryBar: React.FC<FederationSummaryBarProps> = ({
  preview,
  artworkSource,
  className
}) => {
  const summary = computeFederationSummary(preview, artworkSource);

  const getProviderColor = (providerId: string) => {
    switch (providerId.toLowerCase()) {
      case 'musicbrainz':
        return { bg: 'rgba(186, 85, 211, 0.16)', text: '#E9D5FF', border: 'rgba(186, 85, 211, 0.35)', icon: '🌐' };
      case 'discogs':
        return { bg: 'rgba(234, 88, 12, 0.16)', text: '#FFEDD5', border: 'rgba(234, 88, 12, 0.35)', icon: '📀' };
      case 'coverartarchive':
        return { bg: 'rgba(14, 165, 233, 0.16)', text: '#E0F2FE', border: 'rgba(14, 165, 233, 0.35)', icon: '🎨' };
      case 'lrclib':
        return { bg: 'rgba(34, 197, 94, 0.16)', text: '#DCFCE7', border: 'rgba(34, 197, 94, 0.35)', icon: '📝' };
      default:
        return { bg: 'rgba(59, 130, 246, 0.16)', text: '#DBEAFE', border: 'rgba(59, 130, 246, 0.35)', icon: '✨' };
    }
  };

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '8px',
        padding: '8px 14px',
        borderRadius: '8px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        fontSize: '0.78rem'
      }}
    >
      <span style={{ color: '#94A3B8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
        <span>Sources:</span>
      </span>

      {summary.providerContributions.map((contrib) => {
        const style = getProviderColor(contrib.providerId);
        return (
          <div
            key={contrib.providerId}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '3px 8px',
              borderRadius: '5px',
              background: style.bg,
              color: style.text,
              border: `1px solid ${style.border}`,
              fontWeight: 600
            }}
          >
            <span>{style.icon}</span>
            <span>{contrib.providerName}:</span>
            <span style={{ fontWeight: 700 }}>{contrib.fieldCount} {contrib.fieldCount === 1 ? 'tag' : 'tags'}</span>
          </div>
        );
      })}

      {summary.artworkProvider && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '3px 8px',
            borderRadius: '5px',
            background: 'rgba(14, 165, 233, 0.16)',
            color: '#E0F2FE',
            border: '1px solid rgba(14, 165, 233, 0.35)',
            fontWeight: 600
          }}
        >
          <span>🎨</span>
          <span>{summary.artworkProvider} (Artwork)</span>
        </div>
      )}

      {summary.totalChangedFields === 0 && (
        <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>
          No field modifications detected
        </span>
      )}
    </div>
  );
};
