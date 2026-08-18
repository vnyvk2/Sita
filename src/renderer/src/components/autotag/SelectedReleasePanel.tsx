import React from 'react';
import type { AlbumTagPreview } from '../../../../common/metadata/types';
import type { ArtworkSourceOption } from '../../hooks/useAlbumAutoTag';
import { ConfidenceBadge } from './ConfidenceBadge';

export interface SelectedReleasePanelProps {
  preview: AlbumTagPreview;
  artworkSource: ArtworkSourceOption;
  replaceArtwork: boolean;
  onArtworkSourceChange: (source: ArtworkSourceOption) => void;
  onToggleReplaceArtwork: (replace: boolean) => void;
}

export const SelectedReleasePanel: React.FC<SelectedReleasePanelProps> = ({
  preview,
  artworkSource,
  replaceArtwork,
  onArtworkSourceChange,
  onToggleReplaceArtwork
}) => {
  const artworkUrl = preview.album.artwork?.primaryPath || preview.album.artwork?.onlineUrls?.[0];
  const mbid = preview.resolvedRelease?.releaseGroupId || preview.providerReleaseId || 'mbid-canonical-id';
  const confidencePercent = Math.round(preview.overallConfidence * 100);

  return (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '18px 20px',
        display: 'grid',
        gridTemplateColumns: '130px 1fr',
        gap: '20px',
        alignItems: 'center'
      }}
    >
      {/* Left: Artwork & Source Selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
        <div
          style={{
            width: '110px',
            height: '110px',
            borderRadius: '8px',
            overflow: 'hidden',
            background: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative'
          }}
        >
          {artworkUrl && artworkSource !== 'local' ? (
            <img
              src={artworkUrl}
              alt="Cover Art"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', opacity: 0.5, color: 'var(--text-color-dimmed)' }}>
              <span style={{ fontSize: '1.8rem' }}>🎵</span>
              <span style={{ fontSize: '0.65rem' }}>No Cover</span>
            </div>
          )}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-color-white)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={replaceArtwork}
            onChange={(e) => onToggleReplaceArtwork(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <span>Update Cover</span>
        </label>
      </div>

      {/* Right: Release Information, Confidence, MBID/ISRC & Artwork Source */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Release Title & Artist */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-color-white)', lineHeight: 1.2 }}>
              {preview.album.title}
            </div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-color-dimmed)', marginTop: '4px' }}>
              {preview.album.artist} {preview.album.year ? `· ${preview.album.year}` : ''} · {preview.matches.length} tracks
            </div>
          </div>

          {/* Confidence Badge */}
          <ConfidenceBadge level={preview.confidenceLevel} confidence={preview.overallConfidence} />
        </div>

        {/* Identity & Metadata Attributes */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', fontSize: '0.75rem' }}>
          <div style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '4px', padding: '2px 8px', color: '#60a5fa', fontWeight: 500 }}>
            Provider: {preview.provider}
          </div>

          <div style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '4px', padding: '2px 8px', color: 'var(--text-color-dimmed)' }}>
            MBID: <span style={{ fontFamily: 'monospace', color: 'var(--text-color-white)' }}>{mbid.slice(0, 18)}...</span>
          </div>

          <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '4px', padding: '2px 8px', color: '#34d399', fontWeight: 500 }}>
            Confidence: {confidencePercent}%
          </div>
        </div>

        {/* Artwork Source Radio Group */}
        {replaceArtwork && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '2px', fontSize: '0.78rem', color: 'var(--text-color-dimmed)' }}>
            <span style={{ fontWeight: 600 }}>Artwork Source:</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: artworkSource === 'musicbrainz' ? 'var(--text-color-white)' : 'inherit' }}>
              <input
                type="radio"
                name="artworkSource"
                value="musicbrainz"
                checked={artworkSource === 'musicbrainz'}
                onChange={() => onArtworkSourceChange('musicbrainz')}
              />
              MusicBrainz
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: artworkSource === 'coverartarchive' ? 'var(--text-color-white)' : 'inherit' }}>
              <input
                type="radio"
                name="artworkSource"
                value="coverartarchive"
                checked={artworkSource === 'coverartarchive'}
                onChange={() => onArtworkSourceChange('coverartarchive')}
              />
              Cover Art Archive
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: artworkSource === 'local' ? 'var(--text-color-white)' : 'inherit' }}>
              <input
                type="radio"
                name="artworkSource"
                value="local"
                checked={artworkSource === 'local'}
                onChange={() => onArtworkSourceChange('local')}
              />
              Keep Existing
            </label>
          </div>
        )}
      </div>
    </div>
  );
};
