import React, { useState } from 'react';
import type { ArtworkMetadata } from '../../../../common/metadata/types';

export interface ArtworkPreviewCardProps {
  currentArtworkUrl?: string;
  suggestedArtworkUrl?: string;
  artworkMetadata?: ArtworkMetadata;
  providerName?: string;
  replaceArtwork: boolean;
  onToggleReplaceArtwork: (replace: boolean) => void;
}

const formatProviderDisplayName = (providerId?: string): string => {
  if (!providerId) return 'Online Source';
  switch (providerId.toLowerCase()) {
    case 'musicbrainz':
      return 'MusicBrainz';
    case 'discogs':
      return 'Discogs';
    case 'spotify':
      return 'Spotify';
    case 'lastfm':
      return 'Last.fm';
    default:
      return providerId.charAt(0).toUpperCase() + providerId.slice(1);
  }
};

export const ArtworkPreviewCard: React.FC<ArtworkPreviewCardProps> = ({
  currentArtworkUrl,
  suggestedArtworkUrl,
  artworkMetadata,
  providerName,
  replaceArtwork,
  onToggleReplaceArtwork
}) => {
  const [currentImgErr, setCurrentImgErr] = useState(false);
  const [suggestedImgErr, setSuggestedImgErr] = useState(false);

  const providerDisplay = formatProviderDisplayName(providerName);
  const dimensionsDisplay =
    artworkMetadata?.primaryPath ? 'Local Embedded' : 'Online Release';

  return (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '12px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-color)' }}>
            Cover Artwork Preview
          </span>
          <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', fontWeight: 500 }}>
            {providerDisplay}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => onToggleReplaceArtwork(false)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: replaceArtwork ? '1px solid rgba(255,255,255,0.15)' : '1px solid #3b82f6',
              background: replaceArtwork ? 'transparent' : 'rgba(59, 130, 246, 0.2)',
              color: replaceArtwork ? 'var(--text-color-dimmed)' : 'var(--text-color-highlight)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Keep Current
          </button>
          <button
            onClick={() => onToggleReplaceArtwork(true)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: !replaceArtwork ? '1px solid rgba(255,255,255,0.15)' : '1px solid #10b981',
              background: !replaceArtwork ? 'transparent' : 'rgba(16, 185, 129, 0.2)',
              color: !replaceArtwork ? 'var(--text-color-dimmed)' : '#34d399',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Replace Artwork
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Current Artwork */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            padding: '12px',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '8px',
            border: !replaceArtwork ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.06)'
          }}
        >
          <span style={{ fontSize: '0.78rem', color: 'var(--text-color-dimmed)', fontWeight: 500 }}>Current Cover</span>
          <div
            style={{
              width: '100px',
              height: '100px',
              borderRadius: '8px',
              overflow: 'hidden',
              background: 'var(--background-color-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {currentArtworkUrl && !currentImgErr ? (
              <img
                src={currentArtworkUrl}
                alt="Current Cover"
                onError={() => setCurrentImgErr(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ fontSize: '2rem', opacity: 0.4 }}>🎵</span>
            )}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-color-dimmed)' }}>Local Embedded File</span>
        </div>

        {/* Suggested Artwork */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            padding: '12px',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '8px',
            border: replaceArtwork ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.06)'
          }}
        >
          <span style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: 500 }}>Suggested Cover</span>
          <div
            style={{
              width: '100px',
              height: '100px',
              borderRadius: '8px',
              overflow: 'hidden',
              background: 'var(--background-color-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {suggestedArtworkUrl && !suggestedImgErr ? (
              <img
                src={suggestedArtworkUrl}
                alt="Suggested Cover"
                onError={() => setSuggestedImgErr(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ fontSize: '2rem', opacity: 0.4 }}>🎨</span>
            )}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#34d399' }}>
            {dimensionsDisplay} ({providerDisplay})
          </span>
        </div>
      </div>
    </div>
  );
};
