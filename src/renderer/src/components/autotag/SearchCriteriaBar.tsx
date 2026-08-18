import React from 'react';

export interface SearchCriteriaBarProps {
  album: string;
  artist: string;
  totalTracks: string;
  searchExpanded: boolean;
  loading: boolean;
  onAlbumChange: (val: string) => void;
  onArtistChange: (val: string) => void;
  onTotalTracksChange: (val: string) => void;
  onToggleExpanded: () => void;
  onSearch: () => void;
}

export const SearchCriteriaBar: React.FC<SearchCriteriaBarProps> = ({
  album,
  artist,
  totalTracks,
  searchExpanded,
  loading,
  onAlbumChange,
  onArtistChange,
  onTotalTracksChange,
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
        background: 'rgba(15, 23, 42, 0.7)',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        padding: searchExpanded ? '16px 20px' : '10px 18px',
        transition: 'all 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}
    >
      {/* Collapsed Header Summary */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleExpanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleExpanded();
          }
        }}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.06em', color: '#94A3B8', textTransform: 'uppercase' }}>
            {searchExpanded ? '▼ Search Criteria' : '▶ Search Criteria'}
          </span>
          {!searchExpanded && (
            <span style={{ fontSize: '0.88rem', color: '#E2E8F0' }}>
              {artist ? <span style={{ color: '#F8FAFC', fontWeight: 600 }}>{artist} — </span> : ''}
              <span style={{ color: '#F8FAFC', fontWeight: 600 }}>{album || 'No Album'}</span>
              {totalTracks ? <span style={{ color: '#94A3B8', fontWeight: 500 }}> · {totalTracks} tracks</span> : ''}
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
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '4px',
            color: '#CBD5E1',
            padding: '3px 10px',
            fontSize: '0.78rem',
            cursor: 'pointer',
            fontWeight: 500
          }}
        >
          {searchExpanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {/* Expanded Search Inputs Form */}
      {searchExpanded && (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px', gap: '12px', alignItems: 'flex-end' }}>
            {/* Album Artist */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label htmlFor="autotag-artist-input" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.04em' }}>
                ALBUM ARTIST
              </label>
              <input
                id="autotag-artist-input"
                type="text"
                placeholder="e.g. Olivia Rodrigo"
                value={artist}
                onChange={(e) => onArtistChange(e.target.value)}
                style={{
                  padding: '9px 12px',
                  borderRadius: '7px',
                  background: 'rgba(255, 255, 255, 0.07)',
                  border: '1px solid rgba(255, 255, 255, 0.16)',
                  color: '#FFFFFF',
                  outline: 'none',
                  fontSize: '0.88rem'
                }}
              />
            </div>

            {/* Album */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label htmlFor="autotag-album-input" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.04em' }}>
                ALBUM TITLE *
              </label>
              <input
                id="autotag-album-input"
                type="text"
                placeholder="e.g. SOUR"
                value={album}
                onChange={(e) => onAlbumChange(e.target.value)}
                required
                style={{
                  padding: '9px 12px',
                  borderRadius: '7px',
                  background: 'rgba(255, 255, 255, 0.07)',
                  border: '1px solid rgba(255, 255, 255, 0.16)',
                  color: '#FFFFFF',
                  outline: 'none',
                  fontSize: '0.88rem'
                }}
              />
            </div>

            {/* Total Tracks */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label htmlFor="autotag-tracks-input" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.04em' }}>
                TOTAL TRACKS
              </label>
              <input
                id="autotag-tracks-input"
                type="number"
                min="1"
                placeholder="e.g. 11"
                value={totalTracks}
                onChange={(e) => onTotalTracksChange(e.target.value)}
                style={{
                  padding: '9px 10px',
                  borderRadius: '7px',
                  background: 'rgba(255, 255, 255, 0.07)',
                  border: '1px solid rgba(255, 255, 255, 0.16)',
                  color: '#FFFFFF',
                  outline: 'none',
                  fontSize: '0.88rem',
                  textAlign: 'center'
                }}
              />
            </div>
          </div>

          {/* Provider Architecture Description & Find Action */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#94A3B8' }}>
              <span style={{ fontWeight: 600, color: '#CBD5E1' }}>Release source:</span> MusicBrainz
              <span style={{ opacity: 0.4 }}>•</span>
              <span>Discogs genre/style enrichment</span>
              <span style={{ opacity: 0.4 }}>•</span>
              <span>Cover Art Archive artwork</span>
            </div>

            <button
              type="submit"
              disabled={loading || !album.trim()}
              style={{
                padding: '8px 22px',
                borderRadius: '7px',
                background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                border: 'none',
                color: '#FFFFFF',
                fontWeight: 600,
                fontSize: '0.88rem',
                cursor: loading || !album.trim() ? 'not-allowed' : 'pointer',
                opacity: loading || !album.trim() ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
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
