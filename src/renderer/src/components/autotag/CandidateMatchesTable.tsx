import React from 'react';
import type { AlbumMetadata } from '../../../../common/metadata/types';
import { getProviderDisplayName } from '../../../../common/metadata/displayNames';

export interface CandidateMatchesTableProps {
  candidates: AlbumMetadata[];
  selectedCandidateId: string | null;
  loading: boolean;
  onSelectCandidate: (candidate: AlbumMetadata) => void;
}

export const CandidateMatchesTable: React.FC<CandidateMatchesTableProps> = ({
  candidates,
  selectedCandidateId,
  loading,
  onSelectCandidate
}) => {
  if (candidates.length === 0 && !loading) {
    return (
      <div
        style={{
          padding: '24px',
          textAlign: 'center',
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: '10px',
          border: '1px dashed rgba(255, 255, 255, 0.16)',
          color: '#94A3B8',
          fontSize: '0.88rem'
        }}
      >
        No candidate releases found. Enter album and artist above and click Search.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Section Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.06em', color: '#94A3B8', textTransform: 'uppercase' }}>
          Candidate Releases ({candidates.length})
        </span>
      </div>

      {/* Table Container (Scrollable up to max 3 rows) */}
      <div
        style={{
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '10px',
          overflowY: 'auto',
          maxHeight: '210px',
          background: 'rgba(15, 23, 42, 0.6)'
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: 'rgb(15, 23, 42)' }}>
            <tr style={{ background: 'rgba(255, 255, 255, 0.05)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <th style={{ width: '36px', padding: '10px 12px', textAlign: 'center' }}></th>
              <th style={{ padding: '10px 14px' }}>RELEASE</th>
              <th style={{ padding: '10px 14px' }}>ARTIST</th>
              <th style={{ padding: '10px 14px', width: '80px' }}>YEAR</th>
              <th style={{ padding: '10px 14px', width: '150px' }}>MATCH</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((cand, idx) => {
              const candidateKey = cand.releaseId ?? cand.title;
              const isSelected = selectedCandidateId === candidateKey;
              const providerLabel = getProviderDisplayName(cand.provider);

              return (
                <tr
                  key={candidateKey}
                  onClick={() => onSelectCandidate(cand)}
                  style={{
                    borderBottom: idx < candidates.length - 1 ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
                    background: isSelected ? 'rgba(59, 130, 246, 0.22)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {/* Radio Indicator */}
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <div
                      style={{
                        width: '14px',
                        height: '14px',
                        borderRadius: '50%',
                        border: isSelected ? '4px solid #38BDF8' : '1.5px solid rgba(255, 255, 255, 0.4)',
                        background: isSelected ? '#FFFFFF' : 'transparent',
                        margin: '0 auto'
                      }}
                    />
                  </td>

                  {/* Release Title & Subtitle */}
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: isSelected ? 700 : 600, color: '#FFFFFF' }}>
                      {cand.title}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: isSelected ? '#93C5FD' : '#94A3B8', marginTop: '2px' }}>
                      {cand.trackCount ? `${cand.trackCount} tracks` : 'Official Release'} {cand.releaseType ? `· ${cand.releaseType}` : ''}
                    </div>
                  </td>

                  {/* Artist */}
                  <td style={{ padding: '12px 14px', color: '#E2E8F0', fontWeight: 500 }}>
                    {cand.artist || '—'}
                  </td>

                  {/* Year */}
                  <td style={{ padding: '12px 14px', color: '#CBD5E1' }}>
                    {cand.year ?? '—'}
                  </td>

                  {/* Match Rank & Provider */}
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          background: idx === 0 ? 'rgba(52, 211, 153, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                          color: idx === 0 ? '#34D399' : '#94A3B8',
                          border: idx === 0 ? '1px solid rgba(52, 211, 153, 0.4)' : '1px solid rgba(255, 255, 255, 0.12)'
                        }}
                      >
                        {idx === 0 ? 'Best Match' : `#${idx + 1}`}
                      </span>
                      {cand.rankingScore !== undefined && (
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isSelected ? '#93C5FD' : '#CBD5E1' }}>
                          Score {cand.rankingScore}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '3px', fontWeight: 500 }}>
                      {providerLabel}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
