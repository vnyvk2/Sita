import React from 'react';
import type { MetadataFieldId, TrackMatchPreview } from '../../../../common/metadata/types';
import { isFieldChanged } from './utils/previewSummary';

export interface MetadataDiffViewerProps {
  track?: TrackMatchPreview;
  match?: TrackMatchPreview;
  selectedFieldMap: Map<string, boolean>;
  userEditedValues: Map<string, string | number>;
  showChangesOnly?: boolean;
  onFieldChanged: (fieldId: MetadataFieldId, value: string | number) => void;
  onToggleField: (fieldId: MetadataFieldId) => void;
  onResetField: (fieldId: MetadataFieldId) => void;
  onSelectProviderForField?: (fieldId: MetadataFieldId, providerId: string) => void;
}

export const MetadataDiffViewer: React.FC<MetadataDiffViewerProps> = ({
  track,
  match,
  selectedFieldMap,
  userEditedValues,
  showChangesOnly = false,
  onFieldChanged,
  onToggleField,
  onResetField,
  onSelectProviderForField
}) => {
  const activeTrack = track ?? match;
  if (!activeTrack) return null;

  const visibleDiffs = showChangesOnly
    ? activeTrack.fieldDiffs.filter(isFieldChanged)
    : activeTrack.fieldDiffs;

  const getBadgeStyle = (status: string) => {
    switch (status) {
      case 'changed':
        return { bg: 'rgba(245, 158, 11, 0.2)', border: 'rgba(245, 158, 11, 0.45)', text: '#FBBF24', label: 'Changed' };
      case 'new':
        return { bg: 'rgba(16, 185, 129, 0.2)', border: 'rgba(16, 185, 129, 0.45)', text: '#34D399', label: 'New' };
      case 'missing':
        return { bg: 'rgba(148, 163, 184, 0.2)', border: 'rgba(148, 163, 184, 0.4)', text: '#94A3B8', label: 'Missing' };
      default:
        return { bg: 'rgba(255, 255, 255, 0.05)', border: 'transparent', text: '#94A3B8', label: 'Unchanged' };
    }
  };

  const getProviderColor = (providerId?: string) => {
    switch (providerId?.toLowerCase()) {
      case 'musicbrainz':
        return { bg: 'rgba(186, 85, 211, 0.25)', text: '#E9D5FF', border: 'rgba(186, 85, 211, 0.45)' };
      case 'discogs':
        return { bg: 'rgba(234, 88, 12, 0.25)', text: '#FFEDD5', border: 'rgba(234, 88, 12, 0.45)' };
      case 'coverartarchive':
        return { bg: 'rgba(14, 165, 233, 0.25)', text: '#E0F2FE', border: 'rgba(14, 165, 233, 0.45)' };
      default:
        return { bg: 'rgba(59, 130, 246, 0.25)', text: '#DBEAFE', border: 'rgba(59, 130, 246, 0.45)' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', color: '#FFFFFF' }}>
      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#CBD5E1' }}>
        Field Differences for: <span style={{ color: '#38BDF8' }}>{activeTrack.oldTitle}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {visibleDiffs.length === 0 ? (
          <div style={{ padding: '10px 14px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.03)', color: '#94A3B8', fontSize: '0.82rem', fontStyle: 'italic' }}>
            No modified fields for this track. Toggle &quot;All Fields&quot; to inspect unmodified tags.
          </div>
        ) : (
          visibleDiffs.map((diff) => {
          const key = `${activeTrack.localSongId}::${diff.fieldId}`;
          const isSelected = selectedFieldMap.get(key) ?? diff.applyField;
          const userVal = userEditedValues.get(key) ?? diff.userValue ?? diff.suggestedValue ?? '';
          const badge = getBadgeStyle(diff.status);
          const provStyle = getProviderColor(diff.providerId);
          const alternatives = diff.alternatives;

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
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleField(diff.fieldId)}
                style={{ cursor: 'pointer' }}
              />

              <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#F8FAFC' }}>{diff.fieldName}</span>

              <div style={{ fontSize: '0.82rem', color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                {diff.oldValue !== undefined && diff.oldValue !== null ? String(diff.oldValue) : <em style={{ opacity: 0.6 }}>None</em>}
              </div>

              <input
                type="text"
                value={String(userVal)}
                onChange={(e) => onFieldChanged(diff.fieldId, e.target.value)}
                style={{
                  padding: '5px 8px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  color: '#FFFFFF',
                  fontSize: '0.82rem',
                  outline: 'none',
                  fontWeight: 600
                }}
              />

              {/* Provider Selector / Badge */}
              {alternatives && alternatives.length > 1 && onSelectProviderForField ? (
                <select
                  value={diff.providerId ?? 'musicbrainz'}
                  onChange={(e) => onSelectProviderForField(diff.fieldId, e.target.value)}
                  style={{
                    fontSize: '0.75rem',
                    padding: '3px 6px',
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
                    <option key={alt.providerId} value={alt.providerId} style={{ background: '#0F172A', color: '#FFFFFF' }}>
                      {alt.providerName}
                    </option>
                  ))}
                </select>
              ) : (
                <div
                  title={`Source: ${diff.providerName ?? 'MusicBrainz'}`}
                  style={{
                    fontSize: '0.72rem',
                    padding: '3px 6px',
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
                  padding: '3px 6px',
                  borderRadius: '4px',
                  textAlign: 'center',
                  fontWeight: 700,
                  backgroundColor: badge.bg,
                  border: `1px solid ${badge.border}`,
                  color: badge.text
                }}
              >
                {badge.label}
              </span>

              <button
                type="button"
                onClick={() => onResetField(diff.fieldId)}
                title="Reset to suggested"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  fontWeight: 600
                }}
              >
                Reset
              </button>
            </div>
          );
        })
      )}
      </div>
    </div>
  );
};
