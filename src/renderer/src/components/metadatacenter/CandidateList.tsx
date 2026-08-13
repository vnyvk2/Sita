import React from 'react';
import type { WorkflowCandidate } from '../../../../common/metadata/preview';
import styles from './MetadataCenter.module.css';

export interface CandidateListProps {
  candidates: WorkflowCandidate[];
  selectedId: string | null;
  onSelect: (candidateId: string, providerId: string) => void;
}

export const CandidateList: React.FC<CandidateListProps> = ({ candidates, selectedId, onSelect }) => {
  if (!candidates || candidates.length === 0) {
    return (
      <div style={{ padding: '28px', textAlign: 'center', color: 'var(--text-color-dimmed)', fontSize: '13px' }}>
        No releases found. Enter query above and click Search.
      </div>
    );
  }

  const renderStars = (score?: number) => {
    const s = score ?? 0.85;
    const count = s >= 0.95 ? 5 : s >= 0.85 ? 4 : s >= 0.75 ? 3 : 2;
    return Array.from({ length: 5 }).map((_, idx) => (
      <span
        key={idx}
        className="material-symbols-rounded"
        style={{
          fontSize: '16px',
          color: idx < count ? '#F59E0B' : 'rgba(255, 255, 255, 0.2)'
        }}
      >
        star
      </span>
    ));
  };

  return (
    <div className={styles.candidateGrid}>
      {candidates.map((cand) => {
        const isSelected = cand.id === selectedId;
        return (
          <div
            key={cand.id}
            onClick={() => onSelect(cand.id, cand.provider)}
            className={`${styles.candidateCard} ${isSelected ? styles.selectedCandidateCard : ''}`}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              {cand.coverArtUrl ? (
                <img src={cand.coverArtUrl} alt={cand.title} className={styles.candidateThumb} />
              ) : (
                <div
                  className={styles.candidateThumb}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <span className="material-symbols-rounded" style={{ color: 'var(--text-color-dimmed)', fontSize: '24px' }}>
                    album
                  </span>
                </div>
              )}

              <div>
                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-color)' }}>{cand.title}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-color-dimmed)', marginTop: '3px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span>{cand.artist || 'Unknown Artist'}</span>
                  {cand.year && <span>• {cand.year}</span>}
                  {cand.genre && <span>• {cand.genre}</span>}
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>{renderStars(cand.confidenceScore)}</div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  marginTop: '4px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  display: 'inline-block',
                  background: cand.provider === 'musicbrainz' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                  color: cand.provider === 'musicbrainz' ? 'var(--text-color-crimson)' : 'var(--text-color-highlight)'
                }}
              >
                {cand.provider}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
