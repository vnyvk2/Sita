import React from 'react';
import type { WorkflowCandidate } from '../../../../common/metadata/preview';
import styles from './MetadataCenter.module.css';

export interface AlbumSummaryCardProps {
  candidate?: WorkflowCandidate;
  trackCount: number;
}

export const AlbumSummaryCard: React.FC<AlbumSummaryCardProps> = ({ candidate, trackCount }) => {
  if (!candidate) return null;

  return (
    <div className={styles.summaryCard}>
      {candidate.coverArtUrl ? (
        <img src={candidate.coverArtUrl} alt={candidate.title} className={styles.summaryThumb} />
      ) : (
        <div className={styles.summaryThumb} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.8)' }}>
          <span className="material-symbols-rounded" style={{ fontSize: '36px', color: 'var(--text-color-dimmed)' }}>
            album
          </span>
        </div>
      )}

      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-color-white)' }}>{candidate.title}</h3>
            <div style={{ fontSize: '13px', color: 'var(--text-color-highlight)', fontWeight: 500, marginTop: '2px' }}>
              {candidate.artist || 'Unknown Artist'}
            </div>
          </div>
          <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '12px', background: 'rgba(56, 189, 248, 0.15)', color: 'var(--text-color-highlight)', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
            {candidate.provider}
          </span>
        </div>

        <div className={styles.summaryMetaGrid}>
          <div>
            <div className={styles.metaItemKey}>Released</div>
            <div className={styles.metaItemValue}>{candidate.year || 'Unknown'}</div>
          </div>
          <div>
            <div className={styles.metaItemKey}>Tracks</div>
            <div className={styles.metaItemValue}>{trackCount} Tracks</div>
          </div>
          <div>
            <div className={styles.metaItemKey}>Genre</div>
            <div className={styles.metaItemValue}>{candidate.genre || '—'}</div>
          </div>
          <div>
            <div className={styles.metaItemKey}>Style</div>
            <div className={styles.metaItemValue}>{candidate.style || '—'}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
