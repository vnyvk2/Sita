import React from 'react';
import type { TrackMatchPreview } from '../../../../common/metadata/types';
import type { PreviewFilterOption, PreviewSortOption } from '../../hooks/useAlbumAutoTag';
import { getChangedFieldDiffs, getTrackChangeCount } from './utils/previewSummary';

export interface CompactReviewViewProps {
  matches: TrackMatchPreview[];
  selectedTrackIds: Set<number>;
  selectedFieldMap: Map<string, boolean>;
  userEditedValues: Map<string, string | number>;
  expandedTrackId: number | null;
  focusedTrackIndex?: number;
  filter?: PreviewFilterOption;
  sort?: PreviewSortOption;
  onToggleTrack: (songId: number) => void;
  onToggleExpand: (songId: number) => void;
  onOpenDetailed: (songId: number) => void;
  onSelectAll: () => void;
  onSelectChanged: () => void;
  onClearSelections: () => void;
  onFilterChange?: (filter: PreviewFilterOption) => void;
  onSortChange?: (sort: PreviewSortOption) => void;
}

export const CompactReviewView: React.FC<CompactReviewViewProps> = ({
  matches,
  selectedTrackIds,
  userEditedValues,
  expandedTrackId,
  focusedTrackIndex = -1,
  filter = 'all',
  sort = 'trackNumber',
  onToggleTrack,
  onToggleExpand,
  onOpenDetailed,
  onSelectAll,
  onSelectChanged,
  onClearSelections,
  onFilterChange,
  onSortChange
}) => {
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

  const getProviderStyle = (providerId?: string) => {
    switch (providerId?.toLowerCase()) {
      case 'musicbrainz':
        return { bg: 'rgba(186, 85, 211, 0.2)', text: '#E9D5FF', border: 'rgba(186, 85, 211, 0.4)' };
      case 'discogs':
        return { bg: 'rgba(234, 88, 12, 0.2)', text: '#FFEDD5', border: 'rgba(234, 88, 12, 0.4)' };
      case 'coverartarchive':
        return { bg: 'rgba(14, 165, 233, 0.2)', text: '#E0F2FE', border: 'rgba(14, 165, 233, 0.4)' };
      default:
        return { bg: 'rgba(59, 130, 246, 0.2)', text: '#DBEAFE', border: 'rgba(59, 130, 246, 0.4)' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Table Header & Controls Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.06em', color: '#94A3B8', textTransform: 'uppercase' }}>
            Tracks ({selectedTrackIds.size} / {matches.length} Selected)
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

        {/* Filter & Sort Controls */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {onFilterChange && (
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
          )}

          {onSortChange && (
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
          )}
        </div>
      </div>

      {/* Tracks Container */}
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
              <th style={{ padding: '10px 12px' }}>TITLE</th>
              <th style={{ padding: '10px 12px' }}>ARTIST</th>
              <th style={{ width: '110px', padding: '10px 12px', textAlign: 'center' }}>MATCH</th>
              <th style={{ width: '110px', padding: '10px 12px', textAlign: 'center' }}>CHANGES</th>
              <th style={{ width: '36px', padding: '10px 8px', textAlign: 'center' }}></th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match, idx) => {
              const isSelected = selectedTrackIds.has(match.localSongId);
              const isExpanded = expandedTrackId === match.localSongId;
              const isFocused = focusedTrackIndex === idx;
              const titleDiff = match.fieldDiffs.find((d) => d.fieldId === 'title');
              const artistDiff = match.fieldDiffs.find((d) => d.fieldId === 'artist');
              const newTitle = titleDiff?.suggestedValue ?? match.oldTitle;
              const newArtist = artistDiff?.suggestedValue ?? match.oldArtist ?? '—';
              const trackNumFormatted = String(match.oldTrackNumber ?? idx + 1).padStart(2, '0');
              const statusBadge = getMatchStatusBadge(match);
              const changeCount = getTrackChangeCount(match);
              const changedDiffs = getChangedFieldDiffs(match);

              return (
                <React.Fragment key={match.localSongId}>
                  <tr
                    onClick={() => onToggleExpand(match.localSongId)}
                    style={{
                      borderBottom: isExpanded ? 'none' : idx < matches.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
                      background: isExpanded
                        ? 'rgba(59, 130, 246, 0.12)'
                        : isFocused
                        ? 'rgba(255, 255, 255, 0.08)'
                        : isSelected
                        ? 'transparent'
                        : 'rgba(0, 0, 0, 0.25)',
                      opacity: isSelected ? 1 : 0.6,
                      cursor: 'pointer',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    {/* Track Checkbox (Isolated from row click) */}
                    <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          onToggleTrack(match.localSongId);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>

                    {/* Track Number */}
                    <td style={{ padding: '10px 8px', textAlign: 'center', color: '#94A3B8', fontFamily: 'monospace', fontWeight: 600 }}>
                      {trackNumFormatted}
                    </td>

                    {/* Title Summary (Old -> New) */}
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 700, color: '#FFFFFF' }}>{String(newTitle)}</span>
                        {match.oldTitle !== newTitle && (
                          <span style={{ fontSize: '0.78rem', color: '#94A3B8' }}>(was: {match.oldTitle})</span>
                        )}
                      </div>
                    </td>

                    {/* Artist */}
                    <td style={{ padding: '10px 12px', color: '#CBD5E1', fontWeight: 500 }}>
                      {String(newArtist)}
                    </td>

                    {/* Match Confidence Badge */}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
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
                    </td>

                    {/* Change Count Pill */}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      {changeCount > 0 ? (
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            background: 'rgba(245, 158, 11, 0.18)',
                            color: '#FBBF24',
                            border: '1px solid rgba(245, 158, 11, 0.35)'
                          }}
                        >
                          {changeCount} {changeCount === 1 ? 'change' : 'changes'}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: '#64748B', fontStyle: 'italic' }}>
                          No changes
                        </span>
                      )}
                    </td>

                    {/* Expand Chevron */}
                    <td style={{ padding: '10px 8px', textAlign: 'center', color: '#94A3B8', fontSize: '0.78rem' }}>
                      {isExpanded ? '▲' : '▶'}
                    </td>
                  </tr>

                  {/* Expanded Changed-Fields Drawer */}
                  {isExpanded && (
                    <tr style={{ borderBottom: idx < matches.length - 1 ? '1px solid rgba(255, 255, 255, 0.08)' : 'none', background: 'rgba(0, 0, 0, 0.4)' }}>
                      <td colSpan={7} style={{ padding: '14px 20px 18px 48px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              Modified Fields for: <span style={{ color: '#38BDF8' }}>{match.oldTitle}</span>
                            </span>

                            {/* Deep-link to Detailed Review Mode */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenDetailed(match.localSongId);
                              }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '4px 10px',
                                borderRadius: '5px',
                                background: 'rgba(59, 130, 246, 0.18)',
                                border: '1px solid rgba(59, 130, 246, 0.35)',
                                color: '#60A5FA',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}
                            >
                              <span>🔍 Open in Detailed Mode</span>
                              <span>↗</span>
                            </button>
                          </div>

                          {changedDiffs.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {changedDiffs.map((diff) => {
                                const key = `${match.localSongId}::${diff.fieldId}`;
                                const displayVal = userEditedValues.get(key) ?? diff.suggestedValue ?? '';
                                const prov = getProviderStyle(diff.providerId);
                                const isNew = diff.status === 'new';

                                return (
                                  <div
                                    key={diff.fieldId}
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: '140px 1fr 20px 1fr 130px',
                                      alignItems: 'center',
                                      gap: '10px',
                                      padding: '6px 12px',
                                      borderRadius: '6px',
                                      background: 'rgba(255, 255, 255, 0.04)',
                                      border: '1px solid rgba(255, 255, 255, 0.08)',
                                      fontSize: '0.82rem'
                                    }}
                                  >
                                    <span style={{ fontWeight: 700, color: '#E2E8F0' }}>
                                      {diff.fieldName}
                                    </span>

                                    <span style={{ color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {diff.oldValue !== undefined && diff.oldValue !== null ? String(diff.oldValue) : <em style={{ opacity: 0.6 }}>None</em>}
                                    </span>

                                    <span style={{ textAlign: 'center', color: '#64748B', fontWeight: 700 }}>
                                      →
                                    </span>

                                    <span style={{ fontWeight: 600, color: isNew ? '#34D399' : '#FBBF24', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {String(displayVal)}
                                    </span>

                                    <div style={{ textAlign: 'right' }}>
                                      {diff.providerName && (
                                        <span
                                          style={{
                                            padding: '2px 7px',
                                            borderRadius: '4px',
                                            fontSize: '0.7rem',
                                            fontWeight: 600,
                                            background: prov.bg,
                                            color: prov.text,
                                            border: `1px solid ${prov.border}`
                                          }}
                                        >
                                          {diff.providerName}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.02)', color: '#94A3B8', fontSize: '0.8rem', fontStyle: 'italic' }}>
                              All metadata fields already match this track.
                            </div>
                          )}
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
