import React from 'react';
import type { ProviderFilterOption } from '../../hooks/useAlbumAutoTag';

export interface SearchCriteriaBarProps {
  album: string;
  artist: string;
  trackNo: string;
  discNo: string;
  totalTracks: string;
  selectedProvider: ProviderFilterOption;
  searchExpanded: boolean;
  loading: boolean;
  onAlbumChange: (val: string) => void;
  onArtistChange: (val: string) => void;
  onTrackNoChange: (val: string) => void;
  onDiscNoChange: (val: string) => void;
  onTotalTracksChange: (val: string) => void;
  onProviderChange: (provider: ProviderFilterOption) => void;
  onToggleExpanded: () => void;
  onSearch: () => void;
}

export const SearchCriteriaBar: React.FC<SearchCriteriaBarProps> = ({
  album,
  artist,
  trackNo,
  discNo,
  totalTracks,
  selectedProvider,
  searchExpanded,
  loading,
  onAlbumChange,
  onArtistChange,
  onTrackNoChange,
  onDiscNoChange,
  onTotalTracksChange,
  onProviderChange,
  onToggleExpanded,
  onSearch
}) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (album.trim()) {
      onSearch();
    }
  };

  return (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        padding: searchExpanded ? '16px 20px' : '10px 18px',
        transition: 'all 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}
    >
      {/* Collapsed Header Summary */}
      <div
        onClick={onToggleExpanded}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-color-dimmed)', textTransform: 'uppercase' }}>
            {searchExpanded ? '▼ Search Criteria' : '▶ Search Criteria'}
          </span>
          {!searchExpanded && (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-color-white)', opacity: 0.9 }}>
              {artist ? `${artist} — ` : ''}{album || 'No Album'} · <span style={{ textTransform: 'capitalize', color: 'var(--text-color-highlight)' }}>{selectedProvider}</span>
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpanded();
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-color-dimmed)',
            fontSize: '0.8rem',
            cursor: 'pointer'
          }}
        >
          {searchExpanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {/* Expanded Search Inputs Form */}
      {searchExpanded && (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr', gap: '10px', alignItems: 'flex-end' }}>
            {/* Album Artist */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-color-dimmed)', letterSpacing: '0.04em' }}>
                ALBUM ARTIST
              </label>
              <input
                type="text"
                placeholder="e.g. Olivia Rodrigo"
                value={artist}
                onChange={(e) => onArtistChange(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: 'var(--text-color-white)',
                  outline: 'none',
                  fontSize: '0.85rem'
                }}
              />
            </div>

            {/* Album */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-color-dimmed)', letterSpacing: '0.04em' }}>
                ALBUM TITLE *
              </label>
              <input
                type="text"
                placeholder="e.g. SOUR"
                value={album}
                onChange={(e) => onAlbumChange(e.target.value)}
                required
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: 'var(--text-color-white)',
                  outline: 'none',
                  fontSize: '0.85rem'
                }}
              />
            </div>

            {/* Track # */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-color-dimmed)', letterSpacing: '0.04em' }}>
                TRACK #
              </label>
              <input
                type="text"
                placeholder="optional"
                value={trackNo}
                onChange={(e) => onTrackNoChange(e.target.value)}
                style={{
                  padding: '8px 10px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: 'var(--text-color-white)',
                  outline: 'none',
                  fontSize: '0.85rem',
                  textAlign: 'center'
                }}
              />
            </div>

            {/* Disc # */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-color-dimmed)', letterSpacing: '0.04em' }}>
                DISC #
              </label>
              <input
                type="text"
                placeholder="1"
                value={discNo}
                onChange={(e) => onDiscNoChange(e.target.value)}
                style={{
                  padding: '8px 10px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: 'var(--text-color-white)',
                  outline: 'none',
                  fontSize: '0.85rem',
                  textAlign: 'center'
                }}
              />
            </div>

            {/* Total Tracks */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-color-dimmed)', letterSpacing: '0.04em' }}>
                TRACKS
              </label>
              <input
                type="text"
                placeholder="e.g. 11"
                value={totalTracks}
                onChange={(e) => onTotalTracksChange(e.target.value)}
                style={{
                  padding: '8px 10px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: 'var(--text-color-white)',
                  outline: 'none',
                  fontSize: '0.85rem',
                  textAlign: 'center'
                }}
              />
            </div>
          </div>

          {/* Provider Selection & Find Action */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-color-dimmed)', marginRight: '4px' }}>
                Provider:
              </span>
              {(['auto', 'musicbrainz', 'discogs'] as const).map((prov) => {
                const isActive = selectedProvider === prov;
                const label = prov === 'auto' ? 'Auto / Best Match' : prov === 'musicbrainz' ? 'MusicBrainz' : 'Discogs';
                return (
                  <button
                    key={prov}
                    type="button"
                    onClick={() => onProviderChange(prov)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: isActive ? 600 : 400,
                      background: isActive ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                      border: isActive ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.1)',
                      color: isActive ? 'var(--text-color-white)' : 'var(--text-color-dimmed)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <button
              type="submit"
              disabled={loading || !album.trim()}
              style={{
                padding: '7px 20px',
                borderRadius: '6px',
                background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                border: 'none',
                color: 'var(--text-color-white)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: loading || !album.trim() ? 'not-allowed' : 'pointer',
                opacity: loading || !album.trim() ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {loading ? 'Searching...' : '🔍 Search Releases'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
