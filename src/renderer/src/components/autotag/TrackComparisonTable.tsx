import React, { useState } from 'react';
import type { MetadataFieldId, TrackMatchPreview } from '../../../../common/metadata/types';
import { getTrackPreviewKey } from '../../../../common/metadata/preview';
import type { PreviewFilterOption, PreviewSortOption } from '../../hooks/useAlbumAutoTag';
import { MetadataDiffViewer } from './MetadataDiffViewer';

export interface TrackComparisonTableProps {
  matches: TrackMatchPreview[];
  selectedTrackIds: Set<number>;
  selectedFieldMap: Map<string, boolean>;
  userEditedValues: Map<string, string | number>;
  expandedTrackId?: number | null;
  filter: PreviewFilterOption;
  sort: PreviewSortOption;
  onToggleTrack: (songId: number) => void;
  onToggleField: (songId: number, fieldId: MetadataFieldId) => void;
  onToggleExpand?: (songId: number) => void;
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
  expandedTrackId,
  filter,
  sort,
  onToggleTrack,
  onToggleField,
  onToggleExpand,
  onFieldChanged,
  onResetField,
  onSelectAll,
  onSelectChanged,
  onClearSelections,
  onFilterChange,
  onSortChange
}) => {
  const [internalExpandedTrackId, setInternalExpandedTrackId] = useState<number | null>(null);
  const [showChangesOnly, setShowChangesOnly] = useState(true);

  const effectiveExpandedId = expandedTrackId !== undefined ? expandedTrackId : internalExpandedTrackId;

  const toggleExpand = (songId: number) => {
    if (onToggleExpand) {
      onToggleExpand(songId);
    } else {
      setInternalExpandedTrackId((prev) => (prev === songId ? null : songId));
    }
  };

  const getMatchStatusBadge = (match: TrackMatchPreview) => {
    const isExact = match.confidence >= 0.95 && !match.hasWarnings;
    const isRename = match.confidence >= 0.85 && match.fieldDiffs.some((d) => d.fieldId === 'title' && d.status === 'changed');
    const isWarning = match.hasWarnings || match.confidence < 0.8;

    if (isWarning) {
      return { label: '⚠ Warning', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.2)' };
    }
    if (isRename) {
      return { label: '✓ Rename', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.2)' };
    }
    if (isExact) {
      return { label: '✓ Match', color: '#10B981', bg: 'rgba(16, 185, 129, 0.2)' };
    }
    return { label: '✓ Suggested', color: '#60A5FA', bg: 'rgba(59, 130, 246, 0.2)' };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Table Header & Controls Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.06em', color: '#94A3B8', textTransform: 'uppercase' }}>
            Tracks ({selectedTrackIds.size} / {matches.filter((m) => !m.isMissingLocally && m.localSongId > 0).length} Selected{matches.length !== matches.filter((m) => !m.isMissingLocally && m.localSongId > 0).length ? ` · ${matches.length} on album` : ''})
          </span>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={onSelectAll}
              style={{
                padding: '4px 10px',
                borderRadius: '5px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.16)',
                color: '#CBD5E1',
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Select All
            </button>
            <button
              type="button"
              onClick={onSelectChanged}
              style={{
                padding: '4px 10px',
                borderRadius: '5px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.16)',
                color: '#CBD5E1',
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Changed Only
            </button>
            <button
              type="button"
              onClick={onClearSelections}
              style={{
                padding: '4px 10px',
                borderRadius: '5px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#94A3B8',
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontWeight: 500
              }}
            >
              Deselect All
            </button>
          </div>
        </div>

        {/* Filter & Sort & Changes Only Selectors */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* Changes Only Toggle Pill */}
          <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '6px', padding: '2px', border: '1px solid rgba(255, 255, 255, 0.12)' }}>
            <button
              type="button"
              onClick={() => setShowChangesOnly(true)}
              style={{
                padding: '3px 8px',
                borderRadius: '4px',
                border: 'none',
                background: showChangesOnly ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
                color: showChangesOnly ? '#60A5FA' : '#94A3B8',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Changes Only
            </button>
            <button
              type="button"
              onClick={() => setShowChangesOnly(false)}
              style={{
                padding: '3px 8px',
                borderRadius: '4px',
                border: 'none',
                background: !showChangesOnly ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
                color: !showChangesOnly ? '#60A5FA' : '#94A3B8',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              All Fields
            </button>
          </div>

          <label style={{ fontSize: '0.78rem', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 600 }}>
            Filter:
            <select
              value={filter}
              onChange={(e) => onFilterChange(e.target.value as PreviewFilterOption)}
              style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255,255,255,0.18)', color: '#FFFFFF', borderRadius: '4px', padding: '3px 8px', fontSize: '0.78rem' }}
            >
              <option value="all" style={{ background: '#0F172A', color: '#FFFFFF' }}>All Tracks</option>
              <option value="changed" style={{ background: '#0F172A', color: '#FFFFFF' }}>Changed Only</option>
              <option value="low_confidence" style={{ background: '#0F172A', color: '#FFFFFF' }}>Low Confidence</option>
              <option value="warnings" style={{ background: '#0F172A', color: '#FFFFFF' }}>Warnings Only</option>
            </select>
          </label>

          <label style={{ fontSize: '0.78rem', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 600 }}>
            Sort:
            <select
              value={sort}
              onChange={(e) => onSortChange(e.target.value as PreviewSortOption)}
              style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255,255,255,0.18)', color: '#FFFFFF', borderRadius: '4px', padding: '3px 8px', fontSize: '0.78rem' }}
            >
              <option value="trackNumber" style={{ background: '#0F172A', color: '#FFFFFF' }}>Track #</option>
              <option value="confidence" style={{ background: '#0F172A', color: '#FFFFFF' }}>Confidence</option>
              <option value="title" style={{ background: '#0F172A', color: '#FFFFFF' }}>Title</option>
            </select>
          </label>
        </div>
      </div>

      {/* Table Container */}
      <div
        style={{
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '10px',
          overflow: 'hidden',
          background: 'rgba(15, 23, 42, 0.6)'
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
          <thead>
            <tr style={{ background: 'rgba(255, 255, 255, 0.05)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <th style={{ width: '36px', padding: '10px 10px', textAlign: 'center' }}></th>
              <th style={{ width: '36px', padding: '10px 8px', textAlign: 'center' }}>#</th>
              <th style={{ padding: '10px 12px' }}>CURRENT TITLE</th>
              <th style={{ width: '20px', padding: '10px 0', textAlign: 'center' }}></th>
              <th style={{ padding: '10px 12px' }}>NEW TITLE</th>
              <th style={{ padding: '10px 12px' }}>ARTIST</th>
              <th style={{ width: '105px', padding: '10px 12px', textAlign: 'center' }}>STATUS</th>
              <th style={{ width: '36px', padding: '10px 8px', textAlign: 'center' }}></th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match, idx) => {
              const isMissing = Boolean(match.isMissingLocally || match.localSongId <= 0);
              const isSelected = !isMissing && selectedTrackIds.has(match.localSongId);
              const isExpanded = !isMissing && effectiveExpandedId === match.localSongId;
              const itemKey = getTrackPreviewKey(match, idx);
              const titleDiff = match.fieldDiffs.find((d) => d.fieldId === 'title');
              const artistDiff = match.fieldDiffs.find((d) => d.fieldId === 'artist');
              const newTitle = isMissing ? (match.remoteTitle ?? '—') : (titleDiff?.suggestedValue ?? match.oldTitle);
              const newArtist = isMissing ? (match.remoteArtist ?? '—') : (artistDiff?.suggestedValue ?? match.oldArtist ?? '—');
              const trackNumFormatted = String(match.trackNumber ?? match.oldTrackNumber ?? idx + 1).padStart(2, '0');
              const statusBadge = getMatchStatusBadge(match);

              return (
                <React.Fragment key={itemKey}>
                  <tr
                    onClick={isMissing ? undefined : () => toggleExpand(match.localSongId)}
                    style={{
                      borderBottom: isExpanded ? 'none' : idx < matches.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
                      background: isMissing ? 'rgba(0, 0, 0, 0.15)' : isExpanded ? 'rgba(255, 255, 255, 0.05)' : isSelected ? 'transparent' : 'rgba(0, 0, 0, 0.25)',
                      opacity: isMissing ? 0.45 : isSelected ? 1 : 0.6,
                      cursor: isMissing ? 'default' : 'pointer'
                    }}
                  >
                    {/* Track Checkbox */}
                    <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isMissing}
                        onChange={() => {
                          if (isMissing) return;
                          onToggleTrack(match.localSongId);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ cursor: isMissing ? 'not-allowed' : 'pointer', opacity: isMissing ? 0.25 : 1 }}
                      />
                    </td>

                    {/* Track Number */}
                    <td style={{ padding: '10px 8px', textAlign: 'center', color: '#94A3B8', fontFamily: 'monospace', fontWeight: 600 }}>
                      {trackNumFormatted}
                    </td>

                    {/* Current Local Title */}
                    <td style={{ padding: '10px 12px', color: isMissing ? '#64748B' : '#94A3B8', fontWeight: 500, fontStyle: isMissing ? 'italic' : 'normal' }}>
                      {isMissing ? 'Not in library' : match.oldTitle}
                    </td>

                    {/* Arrow */}
                    <td style={{ padding: '10px 0', textAlign: 'center', color: '#94A3B8', fontWeight: 700 }}>
                      →
                    </td>

                    {/* New Suggested Title */}
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: isMissing ? '#94A3B8' : '#FFFFFF', fontStyle: isMissing ? 'italic' : 'normal' }}>
                      {newTitle}
                    </td>

                    {/* Artist */}
                    <td style={{ padding: '10px 12px', color: isMissing ? '#64748B' : '#CBD5E1', fontWeight: 500, fontStyle: isMissing ? 'italic' : 'normal' }}>
                      {newArtist}
                    </td>

                    {/* Status Badge */}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      {isMissing ? (
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.70rem',
                            fontWeight: 600,
                            background: 'rgba(100, 116, 139, 0.15)',
                            color: '#94A3B8',
                            border: '1px solid rgba(100, 116, 139, 0.25)'
                          }}
                        >
                          Missing
                        </span>
                      ) : (
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            background: statusBadge.bg,
                            color: statusBadge.color,
                            border: `1px solid ${statusBadge.bg}`
                          }}
                        >
                          {statusBadge.label}
                        </span>
                      )}
                    </td>

                    {/* Expand Chevron */}
                    <td style={{ padding: '10px 8px', textAlign: 'center', color: '#94A3B8', fontSize: '0.78rem' }}>
                      {!isMissing ? (isExpanded ? '▲' : '▶') : null}
                    </td>
                  </tr>

                  {/* Expanded Detailed Field Diff Drawer */}
                  {isExpanded && (
                    <tr style={{ borderBottom: idx < matches.length - 1 ? '1px solid rgba(255, 255, 255, 0.08)' : 'none', background: 'rgba(0, 0, 0, 0.4)' }}>
                      <td colSpan={8} style={{ padding: '14px 20px 18px 48px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Track-Level Fields ({match.oldTitle})
                          </span>
                          <MetadataDiffViewer
                            track={match}
                            selectedFieldMap={selectedFieldMap}
                            userEditedValues={userEditedValues}
                            showChangesOnly={showChangesOnly}
                            onToggleField={(fieldId) => onToggleField(match.localSongId, fieldId)}
                            onFieldChanged={(fieldId, val) => onFieldChanged(match.localSongId, fieldId, val)}
                            onResetField={(fieldId) => onResetField(match.localSongId, fieldId)}
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
