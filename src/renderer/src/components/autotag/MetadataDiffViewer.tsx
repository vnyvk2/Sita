import React from 'react';
import type { MetadataFieldId, TrackMatchPreview } from '../../../common/metadata/types';

export interface MetadataDiffViewerProps {
  track: TrackMatchPreview;
  selectedFieldMap: Map<string, boolean>;
  userEditedValues: Map<string, string | number>;
  fieldAlternativesMap?: Map<string, Array<{ providerId: string; providerName: string; value: string | number }>>;
  onFieldChanged: (fieldId: MetadataFieldId, value: string | number) => void;
  onToggleField: (fieldId: MetadataFieldId) => void;
  onResetField: (fieldId: MetadataFieldId) => void;
  onSelectProviderForField?: (fieldId: MetadataFieldId, providerId: string) => void;
}

export const MetadataDiffViewer: React.FC<MetadataDiffViewerProps> = ({
  track,
  selectedFieldMap,
  userEditedValues,
  fieldAlternativesMap,
  onFieldChanged,
  onToggleField,
  onResetField,
  onSelectProviderForField
}) => {
  const getBadgeStyle = (status: string) => {
    switch (status) {
      case 'changed':
        return { bg: 'rgba(245, 158, 11, 0.2)', border: 'rgba(245, 158, 11, 0.4)', text: '#fbbf24', label: 'Changed' };
      case 'new':
        return { bg: 'rgba(16, 185, 129, 0.2)', border: 'rgba(16, 185, 129, 0.4)', text: '#34d399', label: 'New' };
      case 'missing':
        return { bg: 'rgba(156, 163, 175, 0.2)', border: 'rgba(156, 163, 175, 0.4)', text: '#9ca3af', label: 'Missing' };
      default:
        return { bg: 'transparent', border: 'transparent', text: 'rgba(255,255,255,0.4)', label: 'Unchanged' };
    }
  };

  const getProviderColor = (providerId?: string) => {
    switch (providerId?.toLowerCase()) {
      case 'musicbrainz':
        return { bg: 'rgba(186, 85, 211, 0.2)', text: '#e9d5ff', border: 'rgba(186, 85, 211, 0.4)' };
      case 'discogs':
        return { bg: 'rgba(234, 88, 12, 0.2)', text: '#ffedd5', border: 'rgba(234, 88, 12, 0.4)' };
      case 'coverartarchive':
        return { bg: 'rgba(14, 165, 233, 0.2)', text: '#e0f2fe', border: 'rgba(14, 165, 233, 0.4)' };
      case 'spotify':
        return { bg: 'rgba(34, 197, 94, 0.2)', text: '#dcfce7', border: 'rgba(34, 197, 94, 0.4)' };
      default:
        return { bg: 'rgba(59, 130, 246, 0.2)', text: '#dbeafe', border: 'rgba(59, 130, 246, 0.4)' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', color: '#f3f4f6' }}>
      <div style={{ fontSize: '0.9rem', fontWeight: 600, opacity: 0.9 }}>
        Field Differences for: <span style={{ color: '#60a5fa' }}>{track.oldTitle}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {track.fieldDiffs.map((diff) => {
          const key = `${track.localSongId}::${diff.fieldId}`;
          const isSelected = selectedFieldMap.get(key) ?? diff.applyField;
          const userVal = userEditedValues.get(key) ?? diff.userValue ?? diff.suggestedValue ?? '';
          const badge = getBadgeStyle(diff.status);
          const provStyle = getProviderColor(diff.providerId);
          const alternatives = fieldAlternativesMap?.get(diff.fieldId);

          return (
            <div
              key={diff.fieldId}
              style={{
                display: 'grid',
                gridTemplateColumns: '30px 120px 1fr 1fr 120px 100px 50px',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 12px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.07)'
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleField(diff.fieldId)}
                style={{ cursor: 'pointer', accentColor: '#3b82f6' }}
              />

              <span style={{ fontWeight: 600, fontSize: '0.82rem', opacity: 0.8 }}>{diff.fieldName}</span>

              <div style={{ fontSize: '0.82rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {diff.oldValue !== undefined && diff.oldValue !== null ? String(diff.oldValue) : <em style={{ opacity: 0.5 }}>None</em>}
              </div>

              <input
                type="text"
                value={String(userVal)}
                onChange={(e) => onFieldChanged(diff.fieldId, e.target.value)}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#ffffff',
                  fontSize: '0.82rem',
                  outline: 'none'
                }}
              />

              {/* Provider Selector / Badge */}
              {alternatives && alternatives.length > 1 && onSelectProviderForField ? (
                <select
                  value={diff.providerId ?? 'musicbrainz'}
                  onChange={(e) => onSelectProviderForField(diff.fieldId, e.target.value)}
                  style={{
                    fontSize: '0.72rem',
                    padding: '2px 4px',
                    borderRadius: '4px',
                    backgroundColor: provStyle.bg,
                    border: `1px solid ${provStyle.border}`,
                    color: provStyle.text,
                    outline: 'none',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  {alternatives.map((alt) => (
                    <option key={alt.providerId} value={alt.providerId} style={{ background: '#1e1e2e', color: '#ffffff' }}>
                      {alt.providerName}
                    </option>
                  ))}
                </select>
              ) : (
                <div
                  title={`Source: ${diff.providerName ?? 'MusicBrainz'}`}
                  style={{
                    fontSize: '0.70rem',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    textAlign: 'center',
                    fontWeight: 600,
                    backgroundColor: provStyle.bg,
                    border: `1px solid ${provStyle.border}`,
                    color: provStyle.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {diff.providerName ?? 'MusicBrainz'}
                </div>
              )}

              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  textAlign: 'center',
                  fontWeight: 600,
                  backgroundColor: badge.bg,
                  border: `1px solid ${badge.border}`,
                  color: badge.text
                }}
              >
                {badge.label}
              </span>

              <button
                onClick={() => onResetField(diff.fieldId)}
                title="Reset to suggested"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                  fontSize: '0.75rem'
                }}
              >
                Reset
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
