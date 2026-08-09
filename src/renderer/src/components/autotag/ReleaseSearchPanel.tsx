import React, { useState } from 'react';
import type { AlbumMetadata } from '../../../../common/metadata/types';

export interface ReleaseSearchPanelProps {
  initialAlbumName?: string;
  initialArtistName?: string;
  candidates: AlbumMetadata[];
  loading: boolean;
  onSearch: (album: string, artist?: string) => void;
  onSelectRelease: (releaseId: string, provider: string) => void;
}

export const ReleaseSearchPanel: React.FC<ReleaseSearchPanelProps> = ({
  initialAlbumName = '',
  initialArtistName = '',
  candidates,
  loading,
  onSearch,
  onSelectRelease
}) => {
  const [album, setAlbum] = useState(initialAlbumName);
  const [artist, setArtist] = useState(initialArtistName);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (album.trim()) {
      onSearch(album.trim(), artist.trim() || undefined);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', color: '#f3f4f6' }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px' }}>
        <input
          type="text"
          placeholder="Album name..."
          value={album}
          onChange={(e) => setAlbum(e.target.value)}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.07)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#ffffff',
            outline: 'none',
            fontSize: '0.9rem'
          }}
        />
        <input
          type="text"
          placeholder="Artist name (optional)..."
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.07)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#ffffff',
            outline: 'none',
            fontSize: '0.9rem'
          }}
        />
        <button
          type="submit"
          disabled={loading || !album.trim()}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
            border: 'none',
            color: '#ffffff',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1
          }}
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '420px', overflowY: 'auto' }}>
        {candidates.length === 0 && !loading && (
          <div style={{ padding: '30px', textAlign: 'center', opacity: 0.6, fontSize: '0.9rem' }}>
            No release candidates found. Search by album title and artist above.
          </div>
        )}

        {candidates.map((cand) => (
          <div
            key={cand.releaseId ?? cand.title}
            style={{
              display: 'flex',
              justify: 'space-between',
              alignItems: 'center',
              padding: '14px 18px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              transition: 'background 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 600, fontSize: '1rem', color: '#ffffff' }}>{cand.title}</span>
                {cand.year && (
                  <span style={{ fontSize: '0.82rem', opacity: 0.7 }}>({cand.year})</span>
                )}
              </div>
              <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                {cand.artist} • {cand.trackCount ? `${cand.trackCount} Tracks` : 'Album'}
                {cand.releaseType && ` • ${cand.releaseType}`}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: 'rgba(139, 92, 246, 0.2)',
                  color: '#a78bfa',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  textTransform: 'uppercase',
                  fontWeight: 600
                }}
              >
                {cand.provider ?? 'musicbrainz'}
              </span>

              <button
                onClick={() => cand.releaseId && onSelectRelease(cand.releaseId, cand.provider ?? 'musicbrainz')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  background: 'rgba(59, 130, 246, 0.2)',
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                  color: '#60a5fa',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Select Release
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
