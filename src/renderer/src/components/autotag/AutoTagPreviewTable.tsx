import React, { useState } from 'react';

import { getTrackPreviewKey } from '../../../../common/metadata/preview';
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
    <div className="flex flex-col gap-4">
      {/* Toolbar Controls */}
      <div className="bg-background-color-2/30 dark:bg-dark-background-color-2/40 border-background-color-2 dark:border-dark-background-color-2 flex items-center justify-between rounded-lg border p-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSelectAll}
            className="bg-background-color-2 hover:bg-background-color-3/40 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3/40 border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-black dark:text-font-color-white cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={onSelectChanged}
            className="bg-background-color-2 hover:bg-background-color-3/40 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3/40 border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-black dark:text-font-color-white cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
          >
            Select Changed Only
          </button>
          <button
            type="button"
            onClick={onClearSelections}
            className="bg-background-color-2 hover:bg-background-color-3/40 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3/40 border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-dimmed hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:text-font-color-white cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
          >
            Clear Selections
          </button>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-font-color-dimmed dark:text-dark-font-color-dimmed flex items-center gap-1.5 text-xs font-medium">
            Filter:
            <select
              value={filter}
              onChange={(e) => onFilterChange(e.target.value as PreviewFilterOption)}
              className="bg-background-color-1 dark:bg-dark-background-color-2 border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-black dark:text-font-color-white focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight cursor-pointer rounded border px-2 py-0.5 text-xs transition-colors outline-none"
            >
              <option value="all">All Tracks</option>
              <option value="changed">Changed Only</option>
              <option value="low_confidence">Low Confidence</option>
              <option value="warnings">Warnings Only</option>
            </select>
          </label>

          <label className="text-font-color-dimmed dark:text-dark-font-color-dimmed flex items-center gap-1.5 text-xs font-medium">
            Sort:
            <select
              value={sort}
              onChange={(e) => onSortChange(e.target.value as PreviewSortOption)}
              className="bg-background-color-1 dark:bg-dark-background-color-2 border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-black dark:text-font-color-white focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight cursor-pointer rounded border px-2 py-0.5 text-xs transition-colors outline-none"
            >
              <option value="trackNumber">Track Number</option>
              <option value="confidence">Confidence</option>
              <option value="title">Title</option>
            </select>
          </label>
        </div>
      </div>

      {/* Track Grid Table */}
      <div className="flex flex-col gap-2">
        {matches.map((track, idx) => {
          const isMissing = Boolean(track.isMissingLocally || track.localSongId <= 0);
          const isSelected = !isMissing && selectedTrackIds.has(track.localSongId);
          const isExpanded = !isMissing && expandedTrackId === track.localSongId;
          const itemKey = getTrackPreviewKey(track, idx);
          const changedCount = track.fieldDiffs.filter(
            (d) => d.status === 'changed' || d.status === 'new'
          ).length;
          const trackNum = track.trackNumber ?? track.oldTrackNumber;

          return (
            <div
              key={itemKey}
              className={`overflow-hidden rounded-lg border transition-colors ${
                isSelected
                  ? 'border-background-color-3 dark:border-dark-background-color-3 bg-background-color-3/10 dark:bg-dark-background-color-3/15'
                  : 'border-background-color-2 dark:border-dark-background-color-2 bg-background-color-2/20 dark:bg-dark-background-color-2/30'
              } ${isMissing ? 'opacity-45' : isSelected ? 'opacity-100' : 'opacity-70'}`}
            >
              {/* Main Track Row */}
              <div
                className={`flex items-center gap-3 px-4 py-3 ${isMissing ? 'cursor-default' : 'hover:bg-background-color-2/40 dark:hover:bg-dark-background-color-2/50 cursor-pointer'}`}
                onClick={
                  isMissing
                    ? undefined
                    : () => setExpandedTrackId(isExpanded ? null : track.localSongId)
                }
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={isMissing}
                  onChange={(e) => {
                    if (isMissing) return;
                    e.stopPropagation();
                    onToggleTrack(track.localSongId);
                  }}
                  className="h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
                />

                <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed w-7 font-mono text-xs font-semibold">
                  {trackNum ? String(trackNum).padStart(2, '0') : '--'}
                </span>

                <div className="flex flex-1 flex-col">
                  <span
                    className={`text-font-color-black dark:text-font-color-white text-sm font-semibold ${isMissing ? 'text-font-color-dimmed dark:text-dark-font-color-dimmed italic' : ''}`}
                  >
                    {isMissing ? (track.remoteTitle ?? '—') : track.oldTitle}
                  </span>
                  <span
                    className={`text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs ${isMissing ? 'italic' : ''}`}
                  >
                    {isMissing ? 'Not in library' : track.oldArtist}
                  </span>
                </div>

                {changedCount > 0 && (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                    {changedCount} diff(s)
                  </span>
                )}

                {track.hasWarnings && (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                    ⚠️ Warning
                  </span>
                )}

                <ConfidenceBadge level={track.confidenceLevel} confidence={track.confidence} />

                <button
                  type="button"
                  className="text-font-color-dimmed hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:text-font-color-white cursor-pointer border-0 bg-transparent p-1 text-xs"
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
                <div className="border-background-color-2 dark:border-dark-background-color-2 bg-background-color-2/30 dark:bg-dark-background-color-2/40 border-t p-4">
                  <MetadataDiffViewer
                    track={track}
                    selectedFieldMap={selectedFieldMap}
                    userEditedValues={userEditedValues}
                    onToggleField={(fieldId) => onToggleField(track.localSongId, fieldId)}
                    onFieldChanged={(fieldId, val) =>
                      onFieldChanged(track.localSongId, fieldId, val)
                    }
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
