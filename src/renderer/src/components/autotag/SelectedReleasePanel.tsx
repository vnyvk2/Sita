import React from 'react';
import type { AlbumTagPreview } from '../../../../common/metadata/types';
import { getProviderDisplayName } from '../../../../common/metadata/displayNames';
import type { ArtworkSourceOption } from '../../hooks/useAlbumAutoTag';
import { ConfidenceBadge } from './ConfidenceBadge';
import { FederationSummaryBar } from './FederationSummaryBar';

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
        background: 'rgba(15, 23, 42, 0.7)',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.12)',
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
            background: 'rgba(0, 0, 0, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)'
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
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: '#94A3B8' }}>
              <span style={{ fontSize: '1.8rem' }}>🎵</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>No Cover</span>
            </div>
          )}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#F8FAFC', cursor: 'pointer', fontWeight: 600 }}>
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
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#FFFFFF', lineHeight: 1.2 }}>
              {preview.album.title}
            </div>
            <div style={{ fontSize: '0.92rem', color: '#CBD5E1', marginTop: '4px', fontWeight: 500 }}>
              <span style={{ color: '#F1F5F9', fontWeight: 600 }}>{preview.album.artist}</span> {preview.album.year ? `· ${preview.album.year}` : ''} · {preview.matches.length} tracks
            </div>
          </div>

          {/* Confidence Badge */}
          <ConfidenceBadge level={preview.confidenceLevel} confidence={preview.overallConfidence} />
        </div>

        {/* Identity & Metadata Attributes */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', fontSize: '0.78rem' }}>
          <div style={{ background: 'rgba(59, 130, 246, 0.25)', border: '1px solid rgba(59, 130, 246, 0.4)', borderRadius: '4px', padding: '3px 10px', color: '#93C5FD', fontWeight: 600 }}>
            Provider: {getProviderDisplayName(preview.provider)}
          </div>

          <div style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.14)', borderRadius: '4px', padding: '3px 10px', color: '#CBD5E1' }}>
            MBID: <span style={{ fontFamily: 'monospace', color: '#FFFFFF', fontWeight: 600 }}>{mbid.slice(0, 18)}...</span>
          </div>

          <div style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '4px', padding: '3px 10px', color: '#34D399', fontWeight: 600 }}>
            Confidence: {confidencePercent}%
          </div>
        </div>

        {/* Dynamic Federation Summary Bar */}
        <FederationSummaryBar
          preview={preview}
          artworkSource={replaceArtwork && artworkSource !== 'local' ? getProviderDisplayName(artworkSource) : undefined}
        />

        {/* Artwork Source Radio Group */}
        {replaceArtwork && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '2px', fontSize: '0.82rem', color: '#CBD5E1' }}>
            <span style={{ fontWeight: 700, color: '#94A3B8' }}>Artwork Source:</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', color: artworkSource === 'musicbrainz' ? '#FFFFFF' : '#94A3B8', fontWeight: artworkSource === 'musicbrainz' ? 600 : 400 }}>
              <input
                type="radio"
                name="artworkSource"
                value="musicbrainz"
                checked={artworkSource === 'musicbrainz'}
                onChange={() => onArtworkSourceChange('musicbrainz')}
              />
              MusicBrainz
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', color: artworkSource === 'coverartarchive' ? '#FFFFFF' : '#94A3B8', fontWeight: artworkSource === 'coverartarchive' ? 600 : 400 }}>
              <input
                type="radio"
                name="artworkSource"
                value="coverartarchive"
                checked={artworkSource === 'coverartarchive'}
                onChange={() => onArtworkSourceChange('coverartarchive')}
              />
              Cover Art Archive
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', color: artworkSource === 'local' ? '#FFFFFF' : '#94A3B8', fontWeight: artworkSource === 'local' ? 600 : 400 }}>
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
