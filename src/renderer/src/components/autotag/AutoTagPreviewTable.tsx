import React, { useState } from 'react';
import type { MetadataFieldId, TrackMatchPreview } from '../../../../common/metadata/types';
import type { PreviewFilterOption, PreviewSortOption } from '../../hooks/useAlbumAutoTag';
import { ConfidenceBadge } from './ConfidenceBadge';
import { MetadataDiffViewer } from './MetadataDiffViewer';

export interface AutoTagPreviewTableProps {
  matches: TrackMatchPreview[];
  selectedTrackIds: Set<number>;
  selectedFieldMap: Map<string, boolean>;
  userEditedValues: Map<string, string | number>;
  filter: PreviewFilterOption;
  sort: PreviewSortOption;
  onToggleTrack: (songId: number) => void;
  onToggleField: (songId: number, fieldId: MetadataFieldId) => void;
  onFieldChanged: (songId: number, fieldId: MetadataFieldId, value: string | number) => void;
  onResetField: (songId: number, fieldId: MetadataFieldId) => void;
  onSelectAll: () => void;
  onSelectChanged: () => void;
  onClearSelections: () => void;
  onFilterChange: (filter: PreviewFilterOption) => void;
  onSortChange: (sort: PreviewSortOption) => void;
}

export const AutoTagPreviewTable: React.FC<AutoTagPreviewTableProps> = ({
  matches,
  selectedTrackIds,
  selectedFieldMap,
  userEditedValues,
  filter,
  sort,
  onToggleTrack,
  onToggleField,
  onFieldChanged,
  onResetField,
  onSelectAll,
  onSelectChanged,
  onClearSelections,
  onFilterChange,
  onSortChange
}) => {
  const [expandedTrackId, setExpandedTrackId] = useState<number | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Toolbar Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255, 255, 255, 0.03)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onSelectAll}
            style={{ padding: '6px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-color-white)', fontSize: '0.8rem', cursor: 'pointer' }}
          >
            Select All
          </button>
          <button
            onClick={onSelectChanged}
            style={{ padding: '6px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-color-white)', fontSize: '0.8rem', cursor: 'pointer' }}
          >
            Select Changed Only
          </button>
          <button
            onClick={onClearSelections}
            style={{ padding: '6px 12px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-color-dimmed)', fontSize: '0.8rem', cursor: 'pointer' }}
          >
            Clear Selections
          </button>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-color-dimmed)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            Filter:
            <select
              value={filter}
              onChange={(e) => onFilterChange(e.target.value as PreviewFilterOption)}
              style={{ background: 'var(--background-color-2)', border: '1px solid rgba(255,255,255,0.2)', color: 'var(--text-color-white)', borderRadius: '4px', padding: '4px 8px', fontSize: '0.8rem' }}
            >
              <option value="all">All Tracks</option>
              <option value="changed">Changed Only</option>
              <option value="low_confidence">Low Confidence</option>
              <option value="warnings">Warnings Only</option>
            </select>
          </label>

          <label style={{ fontSize: '0.8rem', color: 'var(--text-color-dimmed)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            Sort:
            <select
              value={sort}
              onChange={(e) => onSortChange(e.target.value as PreviewSortOption)}
              style={{ background: 'var(--background-color-2)', border: '1px solid rgba(255,255,255,0.2)', color: 'var(--text-color-white)', borderRadius: '4px', padding: '4px 8px', fontSize: '0.8rem' }}
            >
              <option value="trackNumber">Track Number</option>
              <option value="confidence">Confidence</option>
              <option value="title">Title</option>
            </select>
          </label>
        </div>
      </div>

      {/* Track Grid Table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {matches.map((track) => {
          const isSelected = selectedTrackIds.has(track.localSongId);
          const isExpanded = expandedTrackId === track.localSongId;
          const changedCount = track.fieldDiffs.filter((d) => d.status === 'changed' || d.status === 'new').length;

          return (
            <div
              key={track.localSongId}
              style={{
                borderRadius: '8px',
                border: isSelected ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
                background: isSelected ? 'rgba(59, 130, 246, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                overflow: 'hidden'
              }}
            >
              {/* Main Track Row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  gap: '12px',
                  cursor: 'pointer'
                }}
                onClick={() => setExpandedTrackId(isExpanded ? null : track.localSongId)}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => {
                    e.stopPropagation();
                    onToggleTrack(track.localSongId);
                  }}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />

                <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-color-dimmed)', width: '28px' }}>
                  {track.oldTrackNumber ? String(track.oldTrackNumber).padStart(2, '0') : '--'}
                </span>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-color-white)' }}>{track.oldTitle}</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-color-dimmed)' }}>{track.oldArtist}</span>
                </div>

                {changedCount > 0 && (
                  <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.2)', color: 'var(--text-color-highlight)', fontWeight: 500 }}>
                    {changedCount} diff(s)
                  </span>
                )}

                {track.hasWarnings && (
                  <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', fontWeight: 500 }}>
                    ⚠️ Warning
                  </span>
                )}

                <ConfidenceBadge level={track.confidenceLevel} confidence={track.confidence} />

                <button
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-color-dimmed)', cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedTrackId(isExpanded ? null : track.localSongId);
                  }}
                >
                  {isExpanded ? '▲' : '▼'}
                </button>
              </div>

              {/* Expanded Granular Diff Viewer */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', padding: '16px', background: 'rgba(0, 0, 0, 0.3)' }}>
                  <MetadataDiffViewer
                    track={track}
                    selectedFieldMap={selectedFieldMap}
                    userEditedValues={userEditedValues}
                    onToggleField={(fieldId) => onToggleField(track.localSongId, fieldId)}
                    onFieldChanged={(fieldId, val) => onFieldChanged(track.localSongId, fieldId, val)}
                    onResetField={(fieldId) => onResetField(track.localSongId, fieldId)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
