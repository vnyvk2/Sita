import React from 'react';
import type { AlbumTagPreview, TrackMatchPreview } from '../../../../common/metadata/types';
import { ConfidenceBadge } from './ConfidenceBadge';

export interface FinalReviewSummaryCardProps {
  preview: AlbumTagPreview;
  selectedMatches: TrackMatchPreview[];
  replaceArtwork: boolean;
}

export const FinalReviewSummaryCard: React.FC<FinalReviewSummaryCardProps> = ({
  preview,
  selectedMatches,
  replaceArtwork
}) => {
  const titlesChanged = selectedMatches.filter((m) =>
    m.fieldDiffs.some((d) => d.fieldId === 'title' && d.applyField && d.status === 'changed')
  ).length;

  const artistsChanged = selectedMatches.filter((m) =>
    m.fieldDiffs.some((d) => d.fieldId === 'artist' && d.applyField && d.status === 'changed')
  ).length;

  const yearsChanged = selectedMatches.filter((m) =>
    m.fieldDiffs.some((d) => d.fieldId === 'year' && d.applyField && d.status === 'changed')
  ).length;

  const totalFieldChanges = selectedMatches.reduce((acc, m) => {
    return acc + m.fieldDiffs.filter((d) => d.applyField && (d.status === 'changed' || d.status === 'new')).length;
  }, 0);

  const totalWarnings = selectedMatches.reduce((acc, m) => acc + m.warningCount, 0);

  return (
    <div
      style={{
        background: 'rgba(59, 130, 246, 0.08)',
        border: '1px solid rgba(59, 130, 246, 0.25)',
        borderRadius: '12px',
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        color: '#f3f4f6'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>Pre-Apply Summary</span>
          <ConfidenceBadge level={preview.confidenceLevel} confidence={preview.overallConfidence} />
        </div>
        <div style={{ fontSize: '0.85rem', color: '#60a5fa', fontWeight: 600 }}>
          {selectedMatches.length} Tracks ({totalFieldChanges} Field Changes)
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        <div style={{ background: 'rgba(0,0,0,0.25)', padding: '10px 14px', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Titles Changed</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#60a5fa' }}>{titlesChanged}</div>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.25)', padding: '10px 14px', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Artists Changed</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#a78bfa' }}>{artistsChanged}</div>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.25)', padding: '10px 14px', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Years Updated</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fbbf24' }}>{yearsChanged}</div>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.25)', padding: '10px 14px', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Cover Artwork</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: replaceArtwork ? '#34d399' : '#9ca3af', marginTop: '4px' }}>
            {replaceArtwork ? 'Replace' : 'Keep Current'}
          </div>
        </div>
      </div>

      {totalWarnings > 0 && (
        <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#fbbf24', fontSize: '0.82rem', fontWeight: 500 }}>
          ⚠️ {totalWarnings} track warning(s) detected. Please review highlighted differences before proceeding.
        </div>
      )}
    </div>
  );
};
