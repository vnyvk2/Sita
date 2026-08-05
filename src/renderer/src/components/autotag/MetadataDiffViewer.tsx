import React from 'react';
import type { MetadataFieldId, TrackMatchPreview } from '../../../common/metadata/types';

export interface MetadataDiffViewerProps {
  track: TrackMatchPreview;
  selectedFieldMap: Map<string, boolean>;
  userEditedValues: Map<string, string | number>;
  onFieldChanged: (fieldId: MetadataFieldId, value: string | number) => void;
  onToggleField: (fieldId: MetadataFieldId) => void;
  onResetField: (fieldId: MetadataFieldId) => void;
}

export const MetadataDiffViewer: React.FC<MetadataDiffViewerProps> = ({
  track,
  selectedFieldMap,
  userEditedValues,
  onFieldChanged,
  onToggleField,
  onResetField
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

          return (
            <div
              key={diff.fieldId}
              style={{
                display: 'grid',
                gridTemplateColumns: '30px 120px 1fr 1fr 120px 60px',
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
