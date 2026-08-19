import React, { useState } from 'react';
import type { MetadataFieldId, TrackMatchPreview } from '../../../../common/metadata/types';
import { getTrackPreviewKey } from '../../../../common/metadata/preview';
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
      <div className="flex justify-between items-center bg-background-color-2/30 dark:bg-dark-background-color-2/40 p-3 rounded-lg border border-background-color-2 dark:border-dark-background-color-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSelectAll}
            className="px-2.5 py-1 rounded-md bg-background-color-2 hover:bg-background-color-3/40 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3/40 border border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-black dark:text-font-color-white text-xs font-medium transition-colors cursor-pointer"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={onSelectChanged}
            className="px-2.5 py-1 rounded-md bg-background-color-2 hover:bg-background-color-3/40 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3/40 border border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-black dark:text-font-color-white text-xs font-medium transition-colors cursor-pointer"
          >
            Select Changed Only
          </button>
          <button
            type="button"
            onClick={onClearSelections}
            className="px-2.5 py-1 rounded-md bg-background-color-2 hover:bg-background-color-3/40 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3/40 border border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-dimmed hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:text-font-color-white text-xs font-medium transition-colors cursor-pointer"
          >
            Clear Selections
          </button>
        </div>

        <div className="flex gap-3 items-center">
          <label className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed flex items-center gap-1.5 font-medium">
            Filter:
            <select
              value={filter}
              onChange={(e) => onFilterChange(e.target.value as PreviewFilterOption)}
              className="bg-background-color-1 dark:bg-dark-background-color-2 border border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-black dark:text-font-color-white rounded px-2 py-0.5 text-xs outline-none cursor-pointer focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight transition-colors"
            >
              <option value="all">All Tracks</option>
              <option value="changed">Changed Only</option>
              <option value="low_confidence">Low Confidence</option>
              <option value="warnings">Warnings Only</option>
            </select>
          </label>

          <label className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed flex items-center gap-1.5 font-medium">
            Sort:
            <select
              value={sort}
              onChange={(e) => onSortChange(e.target.value as PreviewSortOption)}
              className="bg-background-color-1 dark:bg-dark-background-color-2 border border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-black dark:text-font-color-white rounded px-2 py-0.5 text-xs outline-none cursor-pointer focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight transition-colors"
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
          const changedCount = track.fieldDiffs.filter((d) => d.status === 'changed' || d.status === 'new').length;
          const trackNum = track.trackNumber ?? track.oldTrackNumber;

          return (
            <div
              key={itemKey}
              className={`rounded-lg border transition-colors overflow-hidden ${
                isSelected
                  ? 'border-background-color-3 dark:border-dark-background-color-3 bg-background-color-3/10 dark:bg-dark-background-color-3/15'
                  : 'border-background-color-2 dark:border-dark-background-color-2 bg-background-color-2/20 dark:bg-dark-background-color-2/30'
              } ${isMissing ? 'opacity-45' : isSelected ? 'opacity-100' : 'opacity-70'}`}
            >
              {/* Main Track Row */}
              <div
                className={`flex items-center px-4 py-3 gap-3 ${isMissing ? 'cursor-default' : 'cursor-pointer hover:bg-background-color-2/40 dark:hover:bg-dark-background-color-2/50'}`}
                onClick={isMissing ? undefined : () => setExpandedTrackId(isExpanded ? null : track.localSongId)}
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
                  className="w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
                />

                <span className="font-mono text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed w-7 font-semibold">
                  {trackNum ? String(trackNum).padStart(2, '0') : '--'}
                </span>

                <div className="flex-1 flex flex-col">
                  <span className={`text-sm font-semibold text-font-color-black dark:text-font-color-white ${isMissing ? 'italic text-font-color-dimmed dark:text-dark-font-color-dimmed' : ''}`}>
                    {isMissing ? (track.remoteTitle ?? '—') : track.oldTitle}
                  </span>
                  <span className={`text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed ${isMissing ? 'italic' : ''}`}>
                    {isMissing ? 'Not in library' : track.oldArtist}
                  </span>
                </div>

                {changedCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-font-color-highlight/15 dark:bg-dark-font-color-highlight/15 border border-font-color-highlight/30 dark:border-dark-font-color-highlight/30 text-font-color-highlight dark:text-dark-font-color-highlight font-semibold">
                    {changedCount} diff(s)
                  </span>
                )}

                {track.hasWarnings && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-font-color-crimson/15 border border-font-color-crimson/30 text-font-color-crimson font-semibold">
                    ⚠️ Warning
                  </span>
                )}

                <ConfidenceBadge level={track.confidenceLevel} confidence={track.confidence} />

                <button
                  type="button"
                  className="bg-transparent border-0 text-font-color-dimmed hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:text-font-color-white cursor-pointer text-xs p-1"
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
                <div className="border-t border-background-color-2 dark:border-dark-background-color-2 p-4 bg-background-color-2/30 dark:bg-dark-background-color-2/40">
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

