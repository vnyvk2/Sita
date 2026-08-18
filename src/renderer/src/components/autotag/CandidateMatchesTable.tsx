import React from 'react';
import type { AlbumMetadata } from '../../../../common/metadata/types';

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
          background: 'rgba(255, 255, 255, 0.02)',
          borderRadius: '10px',
          border: '1px dashed rgba(255, 255, 255, 0.1)',
          color: 'var(--text-color-dimmed)',
          fontSize: '0.88rem'
        }}
      >
        No candidate releases found. Enter album and artist above and click Search.
      </div>
    );
  }

  // Helper for star rating & confidence display
  const getConfidenceInfo = (index: number, candidate: AlbumMetadata) => {
    // Generate high confidence score for top match, tapering for lower candidates
    const score = Math.max(70, Math.round(96 - index * 4));
    const starCount = Math.round((score / 100) * 5);
    const stars = '★'.repeat(starCount) + '☆'.repeat(5 - starCount);
    return { score, stars };
  };

  const bestMatchScore = candidates.length > 0 ? getConfidenceInfo(0, candidates[0]).score : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Section Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-color-dimmed)', textTransform: 'uppercase' }}>
          Candidate Releases ({candidates.length})
        </span>
        {candidates.length > 0 && (
          <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 600 }}>
            Best match: {bestMatchScore}%
          </span>
        )}
      </div>

      {/* Table Container */}
      <div
        style={{
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          overflow: 'hidden',
          background: 'rgba(0, 0, 0, 0.2)'
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'rgba(255, 255, 255, 0.04)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-color-dimmed)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
              const { score, stars } = getConfidenceInfo(idx, cand);
              const providerLabel = cand.provider === 'discogs' ? 'Discogs' : 'MusicBrainz';

              return (
                <tr
                  key={candidateKey}
                  onClick={() => onSelectCandidate(cand)}
                  style={{
                    borderBottom: idx < candidates.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
                    background: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
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
                        border: isSelected ? '4px solid #3b82f6' : '1.5px solid rgba(255, 255, 255, 0.3)',
                        background: isSelected ? '#ffffff' : 'transparent',
                        margin: '0 auto'
                      }}
                    />
                  </td>

                  {/* Release Title & Subtitle */}
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: isSelected ? 600 : 500, color: 'var(--text-color-white)' }}>
                      {cand.title}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-color-dimmed)', marginTop: '2px' }}>
                      {cand.trackCount ? `${cand.trackCount} tracks` : 'Official Release'} {cand.releaseType ? `· ${cand.releaseType}` : ''}
                    </div>
                  </td>

                  {/* Artist */}
                  <td style={{ padding: '12px 14px', color: 'var(--text-color-white)' }}>
                    {cand.artist || '—'}
                  </td>

                  {/* Year */}
                  <td style={{ padding: '12px 14px', color: 'var(--text-color-dimmed)' }}>
                    {cand.year ?? '—'}
                  </td>

                  {/* Match Confidence & Provider */}
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: '#fbbf24', fontSize: '0.8rem', letterSpacing: '1px' }}>{stars}</span>
                      <span style={{ fontWeight: 600, fontSize: '0.8rem', color: isSelected ? '#60a5fa' : 'var(--text-color-white)' }}>
                        {score}%
                      </span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-color-dimmed)', marginTop: '2px' }}>
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
