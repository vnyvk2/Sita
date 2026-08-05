import React, { useState } from 'react';
import type { MetadataFieldId, TrackMatchPreview } from '../../../common/metadata/types';
import { ConfidenceBadge } from './ConfidenceBadge';
import { MetadataDiffViewer } from './MetadataDiffViewer';
import type { PreviewFilterOption, PreviewSortOption } from '../../hooks/useAlbumAutoTag';

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
  const [expandedSongId, setExpandedSongId] = useState<number | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', color: '#f3f4f6' }}>
      {/* Controls & Bulk Actions Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: '8px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onSelectAll} style={btnStyle}>Select All</button>
          <button onClick={onSelectChanged} style={btnStyle}>Select Changed Only</button>
          <button onClick={onClearSelections} style={btnStyle}>Clear</button>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '0.82rem' }}>
            <span style={{ opacity: 0.7 }}>Filter:</span>
            <select
              value={filter}
              onChange={(e) => onFilterChange(e.target.value as PreviewFilterOption)}
              style={selectStyle}
            >
              <option value="all">All Tracks</option>
              <option value="changed">Changed Only</option>
              <option value="low_confidence">Low Confidence</option>
              <option value="warnings">Warnings</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '0.82rem' }}>
            <span style={{ opacity: 0.7 }}>Sort:</span>
            <select
              value={sort}
              onChange={(e) => onSortChange(e.target.value as PreviewSortOption)}
              style={selectStyle}
            >
              <option value="trackNumber">Track Number</option>
              <option value="confidence">Confidence</option>
              <option value="title">Title</option>
            </select>
          </div>
        </div>
      </div>

      {/* Track Grid Table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
        {matches.map((track) => {
          const isSelected = selectedTrackIds.has(track.localSongId);
          const isExpanded = expandedSongId === track.localSongId;
          const changedCount = track.fieldDiffs.filter((d) => d.status === 'changed' || d.status === 'new').length;

          return (
            <div
              key={track.localSongId}
              style={{
                display: 'flex',
                flexDirection: 'column',
                borderRadius: '8px',
                background: isExpanded ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 60px 1fr 1fr 140px 100px 80px',
                  alignItems: 'center',
                  padding: '10px 14px',
                  cursor: 'pointer'
                }}
                onClick={() => setExpandedSongId(isExpanded ? null : track.localSongId)}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => {
                    e.stopPropagation();
                    onToggleTrack(track.localSongId);
                  }}
                  style={{ cursor: 'pointer', accentColor: '#3b82f6' }}
                />

                <span style={{ fontSize: '0.82rem', opacity: 0.7 }}>
                  #{track.oldTrackNumber ?? '-'}
                </span>

                <span style={{ fontWeight: 500, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {track.oldTitle}
                </span>

                <span style={{ fontSize: '0.88rem', color: '#60a5fa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {track.fieldDiffs.find((d) => d.fieldId === 'title')?.userValue ?? track.fieldDiffs.find((d) => d.fieldId === 'title')?.suggestedValue ?? track.oldTitle}
                </span>

                <ConfidenceBadge level={track.confidenceLevel} confidence={track.confidence} />

                <span style={{ fontSize: '0.78rem', opacity: 0.8 }}>
                  {changedCount > 0 ? (
                    <span style={{ color: '#fbbf24', fontWeight: 600 }}>{changedCount} Changes</span>
                  ) : (
                    <span style={{ opacity: 0.5 }}>Unchanged</span>
                  )}
                </span>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedSongId(isExpanded ? null : track.localSongId);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#60a5fa',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {isExpanded ? 'Hide Diffs' : 'Edit Diffs'}
                </button>
              </div>

              {/* Inline Granular Diff Viewer */}
              {isExpanded && (
                <div style={{ padding: '14px 18px 18px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}>
                  <MetadataDiffViewer
                    track={track}
                    selectedFieldMap={selectedFieldMap}
                    userEditedValues={userEditedValues}
                    onFieldChanged={(fieldId, val) => onFieldChanged(track.localSongId, fieldId, val)}
                    onToggleField={(fieldId) => onToggleField(track.localSongId, fieldId)}
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

const btnStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: '6px',
  background: 'rgba(255, 255, 255, 0.08)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  color: '#f3f4f6',
  fontSize: '0.78rem',
  fontWeight: 500,
  cursor: 'pointer'
};

const selectStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: '6px',
  background: 'rgba(0,0,0,0.4)',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  color: '#f3f4f6',
  fontSize: '0.78rem',
  outline: 'none'
};
