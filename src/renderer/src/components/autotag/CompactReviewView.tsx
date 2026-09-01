import React from 'react';

import { getTrackPreviewKey } from '../../../../common/metadata/preview';
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
  onToggleField?: (songId: number, fieldId: string) => void;
}

export const CompactReviewView: React.FC<CompactReviewViewProps> = ({
  matches = [],
  selectedTrackIds = new Set(),
  selectedFieldMap = new Map(),
  userEditedValues = new Map(),
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
  onSortChange,
  onToggleField
}) => {
  const getMatchStatusBadge = (match: TrackMatchPreview) => {
    const isExact = match.confidence >= 0.95 && !match.hasWarnings;
    const isRename =
      match.confidence >= 0.85 &&
      match.fieldDiffs.some((d) => d.fieldId === 'title' && d.status === 'changed');
    const isWarning = match.hasWarnings || match.confidence < 0.8;

    if (isWarning) {
      return {
        label: '⚠ Warning',
        className: 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400'
      };
    }
    if (isRename) {
      return {
        label: '✓ Rename',
        className:
          'bg-font-color-highlight/15 dark:bg-dark-font-color-highlight/15 border-font-color-highlight/30 dark:border-dark-font-color-highlight/30 text-font-color-highlight dark:text-dark-font-color-highlight'
      };
    }
    if (isExact) {
      return {
        label: '✓ Match',
        className: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
      };
    }
    return {
      label: '✓ Suggested',
      className:
        'bg-background-color-3/30 dark:bg-dark-background-color-3/30 border-background-color-3/60 dark:border-dark-background-color-3/60 text-font-color-highlight dark:text-dark-font-color-highlight'
    };
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Table Header & Controls Bar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs font-semibold tracking-wider uppercase">
            Tracks ({selectedTrackIds.size} /{' '}
            {matches.filter((m) => !m.isMissingLocally && m.localSongId > 0).length} Selected
            {matches.length !==
            matches.filter((m) => !m.isMissingLocally && m.localSongId > 0).length
              ? ` · ${matches.length} on album`
              : ''}
            )
          </span>

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
              Changed Only
            </button>
            <button
              type="button"
              onClick={onClearSelections}
              className="bg-background-color-2 hover:bg-background-color-3/40 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3/40 border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-dimmed hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:text-font-color-white cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
            >
              Deselect All
            </button>
          </div>
        </div>

        {/* Filter & Sort Controls */}
        <div className="flex items-center gap-2.5">
          {onFilterChange && (
            <label className="text-font-color-dimmed dark:text-dark-font-color-dimmed flex items-center gap-1.5 text-xs font-medium">
              Filter:
              <select
                value={filter}
                onChange={(e) => onFilterChange(e.target.value as PreviewFilterOption)}
                className="bg-background-color-1 dark:bg-dark-background-color-2 border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-black dark:text-font-color-white focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight cursor-pointer rounded border px-2 py-0.5 text-xs transition-colors outline-none"
              >
                <option value="all">All Tracks</option>
                <option value="changed">Changed Only</option>
                <option value="matched">Matched Only</option>
                <option value="warnings">Warnings Only</option>
              </select>
            </label>
          )}

          {onSortChange && (
            <label className="text-font-color-dimmed dark:text-dark-font-color-dimmed flex items-center gap-1.5 text-xs font-medium">
              Sort:
              <select
                value={sort}
                onChange={(e) => onSortChange(e.target.value as PreviewSortOption)}
                className="bg-background-color-1 dark:bg-dark-background-color-2 border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-black dark:text-font-color-white focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight cursor-pointer rounded border px-2 py-0.5 text-xs transition-colors outline-none"
              >
                <option value="trackNumber">Track #</option>
                <option value="confidence">Confidence</option>
                <option value="title">Title</option>
              </select>
            </label>
          )}
        </div>
      </div>

      {/* Tracks Container */}
      <div className="border-background-color-2 dark:border-dark-background-color-2 bg-background-color-2/20 dark:bg-dark-background-color-2/30 overflow-hidden rounded-xl border">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-background-color-2 dark:bg-dark-background-color-2 border-background-color-3/30 dark:border-dark-background-color-3/30 text-font-color-dimmed dark:text-dark-font-color-dimmed border-b text-xs tracking-wider uppercase">
              <th className="w-9 px-2.5 py-2.5 text-center"></th>
              <th className="w-9 px-2 py-2.5 text-center">#</th>
              <th className="px-3 py-2.5">TITLE</th>
              <th className="px-3 py-2.5">ARTIST</th>
              <th className="w-28 px-3 py-2.5 text-center">MATCH</th>
              <th className="w-28 px-3 py-2.5 text-center">CHANGES</th>
              <th className="w-9 px-2 py-2.5 text-center"></th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match, idx) => {
              const isMissing = Boolean(match.isMissingLocally || match.localSongId <= 0);
              const isSelected = !isMissing && selectedTrackIds.has(match.localSongId);
              const isExpanded = !isMissing && expandedTrackId === match.localSongId;
              const isFocused = focusedTrackIndex === idx;
              const itemKey = getTrackPreviewKey(match, idx);

              const trackDiff = match.fieldDiffs.find((d) => d.fieldId === 'trackNumber');
              const titleDiff = match.fieldDiffs.find((d) => d.fieldId === 'title');
              const artistDiff = match.fieldDiffs.find((d) => d.fieldId === 'artist');

              const isTrackFieldSelected =
                !isMissing &&
                (selectedFieldMap.get(`${match.localSongId}::trackNumber`) ??
                  trackDiff?.applyField ??
                  true);
              const isTitleFieldSelected =
                !isMissing &&
                (selectedFieldMap.get(`${match.localSongId}::title`) ??
                  titleDiff?.applyField ??
                  true);
              const isArtistFieldSelected =
                !isMissing &&
                (selectedFieldMap.get(`${match.localSongId}::artist`) ??
                  artistDiff?.applyField ??
                  true);

              const newTitle = titleDiff?.suggestedValue ?? match.oldTitle;
              const newArtist = artistDiff?.suggestedValue ?? match.oldArtist ?? '—';

              const isTrackChanged =
                trackDiff &&
                (trackDiff.status === 'changed' || trackDiff.status === 'new') &&
                trackDiff.suggestedValue !== undefined &&
                Number(trackDiff.suggestedValue) !== match.oldTrackNumber;
              const oldTrackNum =
                match.oldTrackNumber !== undefined
                  ? String(match.oldTrackNumber).padStart(2, '0')
                  : String(idx + 1).padStart(2, '0');
              const newTrackNum =
                match.trackNumber !== undefined
                  ? String(match.trackNumber).padStart(2, '0')
                  : trackDiff?.suggestedValue !== undefined
                    ? String(trackDiff.suggestedValue).padStart(2, '0')
                    : oldTrackNum;

              const showTrackDiff = !isMissing && isTrackChanged && isTrackFieldSelected;

              const showTitleWas =
                !isMissing &&
                isTitleFieldSelected &&
                match.oldTitle !== newTitle &&
                Boolean(match.oldTitle);
              const displayTitle = isMissing
                ? (match.remoteTitle ?? match.oldTitle ?? '—')
                : isTitleFieldSelected
                  ? newTitle
                  : match.oldTitle;

              const showArtistWas =
                !isMissing &&
                isArtistFieldSelected &&
                match.oldArtist &&
                match.oldArtist !== newArtist &&
                newArtist !== '—';
              const displayArtist = isMissing
                ? (match.remoteArtist ?? match.oldArtist ?? '—')
                : isArtistFieldSelected
                  ? newArtist
                  : (match.oldArtist ?? '—');

              const secondaryChangedDiffs = isMissing
                ? []
                : match.fieldDiffs.filter((d) => {
                    if (
                      d.fieldId === 'title' ||
                      d.fieldId === 'artist' ||
                      d.fieldId === 'trackNumber'
                    )
                      return false;
                    if (d.fieldId === 'musicBrainzRecordingId' || d.fieldId === 'isrc')
                      return false; // Exclude raw UUID/ISRC hashes from top-level compact chips
                    if (d.status !== 'changed' && d.status !== 'new') return false;
                    const isFieldSelected =
                      selectedFieldMap.get(`${match.localSongId}::${d.fieldId}`) ?? d.applyField;
                    return isFieldSelected;
                  });

              const activeChangeCount = isMissing
                ? 0
                : match.fieldDiffs.filter(
                    (d) =>
                      (d.status === 'changed' || d.status === 'new') &&
                      (selectedFieldMap.get(`${match.localSongId}::${d.fieldId}`) ?? d.applyField)
                  ).length;

              const statusBadge = getMatchStatusBadge(match);
              const changedDiffs = getChangedFieldDiffs(match);

              return (
                <React.Fragment key={itemKey}>
                  <tr
                    onClick={isMissing ? undefined : () => onToggleExpand(match.localSongId)}
                    className={`border-background-color-2/40 dark:border-dark-background-color-2/40 text-font-color-black dark:text-font-color-white border-b transition-colors ${
                      isMissing
                        ? 'bg-background-color-2/10 dark:bg-dark-background-color-2/10 cursor-default opacity-40'
                        : isExpanded
                          ? 'bg-background-color-2/40 dark:bg-dark-background-color-2/50 cursor-pointer border-b-0'
                          : isFocused
                            ? 'bg-background-color-3/15 dark:bg-dark-background-color-3/15 cursor-pointer'
                            : isSelected
                              ? 'hover:bg-background-color-2/40 dark:hover:bg-dark-background-color-2/50 cursor-pointer'
                              : 'hover:bg-background-color-2/30 dark:hover:bg-dark-background-color-2/40 cursor-pointer opacity-60'
                    }`}
                  >
                    {/* Track Checkbox (Isolated from row click) */}
                    <td className="px-2.5 py-3 text-center align-middle">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isMissing}
                        onChange={(e) => {
                          if (isMissing) return;
                          e.stopPropagation();
                          onToggleTrack(match.localSongId);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="cursor-pointer disabled:cursor-not-allowed"
                      />
                    </td>

                    {/* Track Number Diff */}
                    <td className="px-2 py-3 text-center align-middle font-mono text-xs">
                      {isMissing ? (
                        <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed font-semibold">
                          {newTrackNum}
                        </span>
                      ) : showTrackDiff ? (
                        <div className="inline-flex items-center gap-1">
                          <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs line-through">
                            {oldTrackNum}
                          </span>
                          <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs">
                            →
                          </span>
                          <span className="text-font-color-highlight dark:text-dark-font-color-highlight text-xs font-bold">
                            {newTrackNum}
                          </span>
                        </div>
                      ) : (
                        <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed font-semibold">
                          {oldTrackNum}
                        </span>
                      )}
                    </td>

                    {/* Title Summary (Two-Tier Stack + Secondary Micro-Chips) */}
                    <td className="px-3 py-2.5 align-middle">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`text-sm font-semibold ${
                              isMissing
                                ? 'text-font-color-dimmed dark:text-dark-font-color-dimmed italic'
                                : showTitleWas
                                  ? 'text-font-color-highlight dark:text-dark-font-color-highlight font-bold'
                                  : 'text-font-color-black dark:text-font-color-white'
                            }`}
                          >
                            {String(displayTitle)}
                          </span>
                        </div>

                        {isMissing ? (
                          <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs">
                            Not in library
                          </div>
                        ) : showTitleWas ? (
                          <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs">
                            (was: {match.oldTitle})
                          </div>
                        ) : null}

                        {/* Secondary Field Micro-Chips (Genre, Disc, Year, etc. - excluding MBID/ISRC) */}
                        {secondaryChangedDiffs.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {secondaryChangedDiffs.map((diff) => {
                              const icon =
                                diff.fieldId === 'genre'
                                  ? '🏷️'
                                  : diff.fieldId === 'discNumber'
                                    ? '💿'
                                    : diff.fieldId === 'year'
                                      ? '📅'
                                      : diff.fieldId === 'album'
                                        ? '💽'
                                        : '⚡';
                              return (
                                <span
                                  key={diff.fieldId}
                                  className="bg-background-color-2 dark:bg-dark-background-color-2 border-background-color-3/30 dark:border-dark-background-color-3/30 text-font-color-dimmed dark:text-dark-font-color-dimmed inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[0.7rem]"
                                >
                                  <span>{icon}</span>
                                  <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed">
                                    {diff.fieldName}:
                                  </span>
                                  {diff.status === 'new' ? (
                                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                      {String(diff.suggestedValue)}
                                    </span>
                                  ) : (
                                    <span className="text-font-color-highlight dark:text-dark-font-color-highlight font-semibold">
                                      {String(diff.oldValue ?? '')} → {String(diff.suggestedValue)}
                                    </span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Artist Summary (Two-Tier Stack) */}
                    <td className="px-3 py-2.5 align-middle">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={`text-xs font-medium ${
                            isMissing
                              ? 'text-font-color-dimmed dark:text-dark-font-color-dimmed italic'
                              : showArtistWas
                                ? 'text-font-color-black dark:text-font-color-white'
                                : 'text-font-color-dimmed dark:text-dark-font-color-dimmed'
                          }`}
                        >
                          {String(displayArtist)}
                        </span>
                        {!isMissing && showArtistWas && (
                          <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs">
                            (was: {match.oldArtist})
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Match Confidence Badge */}
                    <td className="px-3 py-2.5 text-center align-middle">
                      {isMissing ? (
                        <span className="bg-background-color-2 dark:bg-dark-background-color-2 border-background-color-3/30 dark:border-dark-background-color-3/30 text-font-color-dimmed dark:text-dark-font-color-dimmed rounded border px-2 py-0.5 text-xs font-medium">
                          Missing
                        </span>
                      ) : (
                        <span
                          className={`rounded border px-2 py-0.5 text-xs font-semibold ${statusBadge.className}`}
                        >
                          {statusBadge.label}
                        </span>
                      )}
                    </td>

                    {/* Change Count Pill */}
                    <td className="px-3 py-2.5 text-center align-middle">
                      {isMissing ? (
                        <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs italic">
                          Not in library
                        </span>
                      ) : activeChangeCount > 0 ? (
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                          {activeChangeCount} {activeChangeCount === 1 ? 'change' : 'changes'}
                        </span>
                      ) : (
                        <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs italic">
                          No changes
                        </span>
                      )}
                    </td>

                    {/* Expand Chevron */}
                    <td className="text-font-color-dimmed dark:text-dark-font-color-dimmed px-2 py-2.5 text-center text-xs">
                      {!isMissing ? (isExpanded ? '▲' : '▶') : null}
                    </td>
                  </tr>

                  {/* Expanded Changed-Fields Drawer */}
                  {isExpanded && (
                    <tr className="border-background-color-2 dark:border-dark-background-color-2 bg-background-color-2/30 dark:bg-dark-background-color-2/40 border-b">
                      <td colSpan={7} className="px-5 py-4 pl-12">
                        <div className="flex flex-col gap-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs font-semibold tracking-wider uppercase">
                              Modified Fields for:{' '}
                              <span className="text-font-color-highlight dark:text-dark-font-color-highlight font-bold">
                                {match.oldTitle}
                              </span>
                            </span>

                            {/* Deep-link to Detailed Review Mode */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenDetailed(match.localSongId);
                              }}
                              className="bg-background-color-2 hover:bg-background-color-3/40 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3/40 border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-highlight dark:text-dark-font-color-highlight inline-flex cursor-pointer items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium transition-colors"
                            >
                              <span>🔍 Open in Detailed Mode</span>
                              <span>↗</span>
                            </button>
                          </div>

                          {changedDiffs.length > 0 ? (
                            <div className="flex flex-col gap-1.5">
                              {changedDiffs.map((diff) => {
                                const key = `${match.localSongId}::${diff.fieldId}`;
                                const isFieldSelected =
                                  selectedFieldMap.get(key) ?? diff.applyField;
                                const displayVal =
                                  userEditedValues.get(key) ?? diff.suggestedValue ?? '';
                                const isNew = diff.status === 'new';

                                return (
                                  <div
                                    key={diff.fieldId}
                                    onClick={() => onToggleField?.(match.localSongId, diff.fieldId)}
                                    className={`grid cursor-pointer grid-cols-[24px_130px_1fr_20px_1fr_120px] items-center gap-2.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                                      isFieldSelected
                                        ? 'bg-background-color-1 dark:bg-dark-background-color-1 border-background-color-2 dark:border-dark-background-color-2 opacity-100'
                                        : 'bg-background-color-2/40 dark:bg-dark-background-color-2/30 border-background-color-2/40 dark:border-dark-background-color-2/30 opacity-50'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isFieldSelected}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        onToggleField?.(match.localSongId, diff.fieldId);
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      className="cursor-pointer"
                                    />

                                    <span
                                      className={`font-semibold ${isFieldSelected ? 'text-font-color-black dark:text-font-color-white' : 'text-font-color-dimmed dark:text-dark-font-color-dimmed'}`}
                                    >
                                      {diff.fieldName}
                                    </span>

                                    <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed overflow-hidden text-ellipsis whitespace-nowrap">
                                      {diff.oldValue !== undefined && diff.oldValue !== null ? (
                                        String(diff.oldValue)
                                      ) : (
                                        <em className="opacity-60">None</em>
                                      )}
                                    </span>

                                    <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-center font-bold">
                                      →
                                    </span>

                                    <span
                                      className={`overflow-hidden font-semibold text-ellipsis whitespace-nowrap ${
                                        !isFieldSelected
                                          ? 'text-font-color-dimmed dark:text-dark-font-color-dimmed line-through'
                                          : isNew
                                            ? 'text-emerald-600 dark:text-emerald-400'
                                            : 'text-font-color-highlight dark:text-dark-font-color-highlight'
                                      }`}
                                    >
                                      {String(displayVal)}
                                    </span>

                                    <div className="text-right">
                                      {diff.providerName && (
                                        <span className="bg-background-color-2 dark:bg-dark-background-color-2 border-background-color-3/30 dark:border-dark-background-color-3/30 text-font-color-dimmed dark:text-dark-font-color-dimmed rounded border px-2 py-0.5 text-[0.7rem] font-medium">
                                          {diff.providerName}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="bg-background-color-2/20 dark:bg-dark-background-color-2/30 text-font-color-dimmed dark:text-dark-font-color-dimmed rounded-lg p-3 text-xs italic">
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
