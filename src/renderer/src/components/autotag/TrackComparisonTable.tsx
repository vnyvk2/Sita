import React, { useState } from 'react';
import type { MetadataFieldId, TrackMatchPreview } from '../../../../common/metadata/types';
import type { PreviewFilterOption, PreviewSortOption } from '../../hooks/useAlbumAutoTag';
import { MetadataDiffViewer } from './MetadataDiffViewer';

export interface TrackComparisonTableProps {
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

export const TrackComparisonTable: React.FC<TrackComparisonTableProps> = ({
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

  const toggleExpand = (songId: number) => {
    setExpandedTrackId((prev) => (prev === songId ? null : songId));
  };

  const getMatchStatusBadge = (match: TrackMatchPreview) => {
    const isExact = match.confidence >= 0.95 && !match.hasWarnings;
    const isRename = match.confidence >= 0.85 && match.fieldDiffs.some((d) => d.fieldId === 'title' && d.status === 'changed');
    const isWarning = match.hasWarnings || match.confidence < 0.8;

    if (isWarning) {
      return { label: '⚠ Warning', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' };
    }
    if (isRename) {
      return { label: '✓ Rename', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' };
    }
    if (isExact) {
      return { label: '✓ Match', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' };
    }
    return { label: '✓ Suggested', color: '#60a5fa', bg: 'rgba(59, 130, 246, 0.15)' };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Table Header & Controls Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-color-dimmed)', textTransform: 'uppercase' }}>
            Tracks ({selectedTrackIds.size} / {matches.length} Selected)
          </span>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              onClick={onSelectAll}
              style={{
                padding: '3px 8px',
                borderRadius: '4px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: 'var(--text-color-dimmed)',
                fontSize: '0.72rem',
                cursor: 'pointer'
              }}
            >
              Select All
            </button>
            <button
              type="button"
              onClick={onSelectChanged}
              style={{
                padding: '3px 8px',
                borderRadius: '4px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: 'var(--text-color-dimmed)',
                fontSize: '0.72rem',
                cursor: 'pointer'
              }}
            >
              Changed Only
            </button>
            <button
              type="button"
              onClick={onClearSelections}
              style={{
                padding: '3px 8px',
                borderRadius: '4px',
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: 'var(--text-color-dimmed)',
                fontSize: '0.72rem',
                cursor: 'pointer'
              }}
            >
              Deselect All
            </button>
          </div>
        </div>

        {/* Filter & Sort Selectors */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-color-dimmed)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            Filter:
            <select
              value={filter}
              onChange={(e) => onFilterChange(e.target.value as PreviewFilterOption)}
              style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-color-white)', borderRadius: '4px', padding: '2px 6px', fontSize: '0.75rem' }}
            >
              <option value="all">All Tracks</option>
              <option value="changed">Changed Only</option>
              <option value="low_confidence">Low Confidence</option>
              <option value="warnings">Warnings Only</option>
            </select>
          </label>

          <label style={{ fontSize: '0.75rem', color: 'var(--text-color-dimmed)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            Sort:
            <select
              value={sort}
              onChange={(e) => onSortChange(e.target.value as PreviewSortOption)}
              style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-color-white)', borderRadius: '4px', padding: '2px 6px', fontSize: '0.75rem' }}
            >
              <option value="trackNumber">Track #</option>
              <option value="confidence">Confidence</option>
              <option value="title">Title</option>
            </select>
          </label>
        </div>
      </div>

      {/* Table Container */}
      <div
        style={{
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          overflow: 'hidden',
          background: 'rgba(0, 0, 0, 0.2)'
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ background: 'rgba(255, 255, 255, 0.04)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-color-dimmed)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <th style={{ width: '36px', padding: '8px 10px', textAlign: 'center' }}></th>
              <th style={{ width: '36px', padding: '8px 8px', textAlign: 'center' }}>#</th>
              <th style={{ padding: '8px 12px' }}>CURRENT TITLE</th>
              <th style={{ width: '20px', padding: '8px 0', textAlign: 'center' }}></th>
              <th style={{ padding: '8px 12px' }}>NEW TITLE</th>
              <th style={{ padding: '8px 12px' }}>ARTIST</th>
              <th style={{ width: '100px', padding: '8px 12px', textAlign: 'center' }}>STATUS</th>
              <th style={{ width: '36px', padding: '8px 8px', textAlign: 'center' }}></th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match, idx) => {
              const isSelected = selectedTrackIds.has(match.localSongId);
              const isExpanded = expandedTrackId === match.localSongId;
              const titleDiff = match.fieldDiffs.find((d) => d.fieldId === 'title');
              const artistDiff = match.fieldDiffs.find((d) => d.fieldId === 'artist');
              const newTitle = titleDiff?.suggestedValue ?? match.oldTitle;
              const newArtist = artistDiff?.suggestedValue ?? match.oldArtist ?? '—';
              const trackNumFormatted = String(match.oldTrackNumber ?? idx + 1).padStart(2, '0');
              const statusBadge = getMatchStatusBadge(match);

              return (
                <React.Fragment key={match.localSongId}>
                  <tr
                    onClick={() => toggleExpand(match.localSongId)}
                    style={{
                      borderBottom: isExpanded ? 'none' : idx < matches.length - 1 ? '1px solid rgba(255, 255, 255, 0.04)' : 'none',
                      background: isExpanded ? 'rgba(255, 255, 255, 0.03)' : isSelected ? 'transparent' : 'rgba(0, 0, 0, 0.15)',
                      opacity: isSelected ? 1 : 0.5,
                      cursor: 'pointer'
                    }}
                  >
                    {/* Track Checkbox */}
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          onToggleTrack(match.localSongId);
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>

                    {/* Track Number */}
                    <td style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--text-color-dimmed)', fontFamily: 'monospace' }}>
                      {trackNumFormatted}
                    </td>

                    {/* Current Local Title */}
                    <td style={{ padding: '8px 12px', color: 'var(--text-color-dimmed)' }}>
                      {match.oldTitle}
                    </td>

                    {/* Arrow */}
                    <td style={{ padding: '8px 0', textAlign: 'center', color: 'var(--text-color-dimmed)', opacity: 0.6 }}>
                      →
                    </td>

                    {/* New Suggested Title */}
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-color-white)' }}>
                      {newTitle}
                    </td>

                    {/* Artist */}
                    <td style={{ padding: '8px 12px', color: 'var(--text-color-dimmed)' }}>
                      {newArtist}
                    </td>

                    {/* Status Badge */}
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          background: statusBadge.bg,
                          color: statusBadge.color,
                          border: `1px solid ${statusBadge.bg}`
                        }}
                      >
                        {statusBadge.label}
                      </span>
                    </td>

                    {/* Expand Chevron */}
                    <td style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--text-color-dimmed)', fontSize: '0.75rem' }}>
                      {isExpanded ? '▲' : '▼'}
                    </td>
                  </tr>

                  {/* Expanded Detailed Field Diff Drawer */}
                  {isExpanded && (
                    <tr style={{ borderBottom: idx < matches.length - 1 ? '1px solid rgba(255, 255, 255, 0.06)' : 'none', background: 'rgba(0, 0, 0, 0.35)' }}>
                      <td colSpan={8} style={{ padding: '12px 18px 16px 48px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-color-dimmed)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Track-Level Fields ({match.oldTitle})
                          </span>
                          <MetadataDiffViewer
                            match={match}
                            selectedFieldMap={selectedFieldMap}
                            userEditedValues={userEditedValues}
                            onToggleField={onToggleField}
                            onFieldChanged={onFieldChanged}
                            onResetField={onResetField}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
