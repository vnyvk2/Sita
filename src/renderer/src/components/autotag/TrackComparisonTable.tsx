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
      return { label: '⚠ Warning', className: 'bg-red-500/15 border-red-500/30 text-font-color-crimson' };
    }
    if (isRename) {
      return { label: '✓ Rename', className: 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400' };
    }
    if (isExact) {
      return { label: '✓ Match', className: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' };
    }
    return { label: '✓ Suggested', className: 'bg-background-color-3/30 border-background-color-3/60 text-font-color-highlight' };
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Table Header & Controls Bar */}
      <div className="flex justify-between items-center px-1">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold tracking-wider text-font-color-dimmed uppercase">
            Tracks ({selectedTrackIds.size} / {matches.filter((m) => !m.isMissingLocally && m.localSongId > 0).length} Selected{matches.length !== matches.filter((m) => !m.isMissingLocally && m.localSongId > 0).length ? ` · ${matches.length} on album` : ''})
          </span>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSelectAll}
              className="px-2.5 py-1 rounded-md bg-background-color-2 hover:bg-background-color-3/40 border border-background-color-3/40 text-font-color text-xs font-medium transition-colors cursor-pointer"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={onSelectChanged}
              className="px-2.5 py-1 rounded-md bg-background-color-2 hover:bg-background-color-3/40 border border-background-color-3/40 text-font-color text-xs font-medium transition-colors cursor-pointer"
            >
              Changed Only
            </button>
            <button
              type="button"
              onClick={onClearSelections}
              className="px-2.5 py-1 rounded-md bg-background-color-2 hover:bg-background-color-3/40 border border-background-color-3/40 text-font-color-dimmed hover:text-font-color text-xs font-medium transition-colors cursor-pointer"
            >
              Deselect All
            </button>
          </div>
        </div>

        {/* Filter & Sort & Changes Only Selectors */}
        <div className="flex gap-2.5 items-center">
          {/* Changes Only Toggle Pill */}
          <div className="flex bg-background-color-2 rounded-md p-0.5 border border-background-color-3/40">
            <button
              type="button"
              onClick={() => setShowChangesOnly(true)}
              className={`px-2 py-0.5 rounded text-xs font-semibold cursor-pointer transition-colors ${
                showChangesOnly
                  ? 'bg-background-color-1 text-font-color-highlight shadow-xs'
                  : 'text-font-color-dimmed hover:text-font-color'
              }`}
            >
              Changes Only
            </button>
            <button
              type="button"
              onClick={() => setShowChangesOnly(false)}
              className={`px-2 py-0.5 rounded text-xs font-semibold cursor-pointer transition-colors ${
                !showChangesOnly
                  ? 'bg-background-color-1 text-font-color-highlight shadow-xs'
                  : 'text-font-color-dimmed hover:text-font-color'
              }`}
            >
              All Fields
            </button>
          </div>

          <label className="text-xs text-font-color-dimmed flex items-center gap-1.5 font-medium">
            Filter:
            <select
              value={filter}
              onChange={(e) => onFilterChange(e.target.value as PreviewFilterOption)}
              className="bg-background-color-1 border border-background-color-3/40 text-font-color rounded px-2 py-0.5 text-xs outline-none cursor-pointer focus:border-font-color-highlight transition-colors"
            >
              <option value="all">All Tracks</option>
              <option value="changed">Changed Only</option>
              <option value="low_confidence">Low Confidence</option>
              <option value="warnings">Warnings Only</option>
            </select>
          </label>

          <label className="text-xs text-font-color-dimmed flex items-center gap-1.5 font-medium">
            Sort:
            <select
              value={sort}
              onChange={(e) => onSortChange(e.target.value as PreviewSortOption)}
              className="bg-background-color-1 border border-background-color-3/40 text-font-color rounded px-2 py-0.5 text-xs outline-none cursor-pointer focus:border-font-color-highlight transition-colors"
            >
              <option value="trackNumber">Track #</option>
              <option value="confidence">Confidence</option>
              <option value="title">Title</option>
            </select>
          </label>
        </div>
      </div>

      {/* Table Container */}
      <div className="border border-background-color-2 rounded-xl overflow-hidden bg-background-color-2/20">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-background-color-2 border-b border-background-color-3/30 text-font-color-dimmed text-xs uppercase tracking-wider">
              <th className="w-9 px-2.5 py-2.5 text-center"></th>
              <th className="w-9 px-2 py-2.5 text-center">#</th>
              <th className="px-3 py-2.5">CURRENT TITLE</th>
              <th className="w-5 px-0 py-2.5 text-center"></th>
              <th className="px-3 py-2.5">NEW TITLE</th>
              <th className="px-3 py-2.5">ARTIST</th>
              <th className="w-28 px-3 py-2.5 text-center">STATUS</th>
              <th className="w-9 px-2 py-2.5 text-center"></th>
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
                    className={`border-b border-background-color-2/40 transition-colors text-font-color ${
                      isMissing
                        ? 'opacity-40 bg-background-color-2/10 cursor-default'
                        : isExpanded
                        ? 'bg-background-color-2/40 border-b-0 cursor-pointer'
                        : isSelected
                        ? 'hover:bg-background-color-2/40 cursor-pointer'
                        : 'opacity-60 hover:bg-background-color-2/30 cursor-pointer'
                    }`}
                  >
                    {/* Track Checkbox */}
                    <td className="px-2.5 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isMissing}
                        onChange={() => {
                          if (isMissing) return;
                          onToggleTrack(match.localSongId);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="cursor-pointer disabled:cursor-not-allowed"
                      />
                    </td>

                    {/* Track Number */}
                    <td className="px-2 py-2.5 text-center text-font-color-dimmed font-mono text-xs font-semibold">
                      {trackNumFormatted}
                    </td>

                    {/* Current Local Title */}
                    <td className={`px-3 py-2.5 font-medium ${isMissing ? 'text-font-color-dimmed italic' : 'text-font-color-dimmed'}`}>
                      {isMissing ? 'Not in library' : match.oldTitle}
                    </td>

                    {/* Arrow */}
                    <td className="px-0 py-2.5 text-center text-font-color-dimmed font-bold">
                      →
                    </td>

                    {/* New Suggested Title */}
                    <td className={`px-3 py-2.5 font-semibold ${isMissing ? 'text-font-color-dimmed italic' : 'text-font-color-highlight font-bold'}`}>
                      {newTitle}
                    </td>

                    {/* Artist */}
                    <td className={`px-3 py-2.5 text-xs font-medium ${isMissing ? 'text-font-color-dimmed italic' : 'text-font-color'}`}>
                      {newArtist}
                    </td>

                    {/* Status Badge */}
                    <td className="px-3 py-2.5 text-center">
                      {isMissing ? (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-background-color-2 border border-background-color-3/30 text-font-color-dimmed">
                          Missing
                        </span>
                      ) : (
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${statusBadge.className}`}>
                          {statusBadge.label}
                        </span>
                      )}
                    </td>

                    {/* Expand Chevron */}
                    <td className="px-2 py-2.5 text-center text-font-color-dimmed text-xs">
                      {!isMissing ? (isExpanded ? '▲' : '▶') : null}
                    </td>
                  </tr>

                  {/* Expanded Detailed Field Diff Drawer */}
                  {isExpanded && (
                    <tr className="border-b border-background-color-2 bg-background-color-2/30">
                      <td colSpan={8} className="px-5 py-4 pl-12">
                        <div className="flex flex-col gap-2">
                          <span className="text-xs font-semibold text-font-color-dimmed uppercase tracking-wider">
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

