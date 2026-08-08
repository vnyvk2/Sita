import React from 'react';

export interface CandidateListProps {
  candidates: any[];
  selectedId: string | null;
  onSelect: (candidateId: string, providerId: string) => void;
}

export const CandidateList: React.FC<CandidateListProps> = ({ candidates, selectedId, onSelect }) => {
  if (!candidates || candidates.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'rgba(255, 255, 255, 0.4)', fontSize: '13px' }}>
        No search results yet. Enter search query and press Search.
      </div>
    );
  }

  const renderStars = (score?: number) => {
    const s = score ?? 0.8;
    if (s >= 0.95) return '★★★★★';
    if (s >= 0.85) return '★★★★☆';
    if (s >= 0.75) return '★★★☆☆';
    return '★★☆☆☆';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto', paddingRight: '4px' }}>
      {candidates.map((cand) => {
        const isSelected = cand.id === selectedId;
        return (
          <div
            key={cand.id}
            onClick={() => onSelect(cand.id, cand.provider)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderRadius: '8px',
              background: isSelected ? 'rgba(96, 165, 250, 0.15)' : 'rgba(255, 255, 255, 0.04)',
              border: isSelected ? '1px solid #60A5FA' : '1px solid rgba(255, 255, 255, 0.08)',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {cand.coverArtUrl ? (
                <img
                  src={cand.coverArtUrl}
                  alt={cand.title}
                  style={{ width: '44px', height: '44px', borderRadius: '6px', objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px'
                  }}
                >
                  💿
                </div>
              )}
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px', color: '#FFF' }}>{cand.title}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', marginTop: '2px' }}>
                  {cand.artist || 'Unknown Artist'} {cand.year ? `• ${cand.year}` : ''} {cand.genre ? `• ${cand.genre}` : ''}
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '13px', color: '#FBBF24', letterSpacing: '1px' }}>{renderStars(cand.confidenceScore)}</div>
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
                  color: cand.provider === 'musicbrainz' ? '#F87171' : '#60A5FA'
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
