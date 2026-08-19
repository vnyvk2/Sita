import React from 'react';
import type { TrackMatchPreview } from '../../../../common/metadata/types';
import { getTrackPreviewKey } from '../../../../common/metadata/preview';
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
  matches,
  selectedTrackIds,
  selectedFieldMap,
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
  onSortChange,
  onToggleField
}) => {
  const getMatchStatusBadge = (match: TrackMatchPreview) => {
    const isExact = match.confidence >= 0.95 && !match.hasWarnings;
    const isRename = match.confidence >= 0.85 && match.fieldDiffs.some((d) => d.fieldId === 'title' && d.status === 'changed');
    const isWarning = match.hasWarnings || match.confidence < 0.8;

    if (isWarning) {
      return { label: '⚠ Warning', className: 'bg-font-color-crimson/15 border-font-color-crimson/30 text-font-color-crimson' };
    }
    if (isRename) {
      return { label: '✓ Rename', className: 'bg-font-color-highlight/15 dark:bg-dark-font-color-highlight/15 border-font-color-highlight/30 dark:border-dark-font-color-highlight/30 text-font-color-highlight dark:text-dark-font-color-highlight' };
    }
    if (isExact) {
      return { label: '✓ Match', className: 'bg-font-color-highlight/15 dark:bg-dark-font-color-highlight/15 border-font-color-highlight/30 dark:border-dark-font-color-highlight/30 text-font-color-highlight dark:text-dark-font-color-highlight' };
    }
    return { label: '✓ Suggested', className: 'bg-background-color-3/30 dark:bg-dark-background-color-3/30 border-background-color-3/60 dark:border-dark-background-color-3/60 text-font-color-highlight dark:text-dark-font-color-highlight' };
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Table Header & Controls Bar */}
      <div className="flex justify-between items-center px-1">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold tracking-wider text-font-color-dimmed dark:text-dark-font-color-dimmed uppercase">
            Tracks ({selectedTrackIds.size} / {matches.filter((m) => !m.isMissingLocally && m.localSongId > 0).length} Selected{matches.length !== matches.filter((m) => !m.isMissingLocally && m.localSongId > 0).length ? ` · ${matches.length} on album` : ''})
          </span>

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
              Changed Only
            </button>
            <button
              type="button"
              onClick={onClearSelections}
              className="px-2.5 py-1 rounded-md bg-background-color-2 hover:bg-background-color-3/40 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3/40 border border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-dimmed hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:text-font-color-white text-xs font-medium transition-colors cursor-pointer"
            >
              Deselect All
            </button>
          </div>
        </div>

        {/* Filter & Sort Controls */}
        <div className="flex gap-2.5 items-center">
          {onFilterChange && (
            <label className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed flex items-center gap-1.5 font-medium">
              Filter:
              <select
                value={filter}
                onChange={(e) => onFilterChange(e.target.value as PreviewFilterOption)}
                className="bg-background-color-1 dark:bg-dark-background-color-2 border border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-black dark:text-font-color-white rounded px-2 py-0.5 text-xs outline-none cursor-pointer focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight transition-colors"
              >
                <option value="all">All Tracks</option>
                <option value="changed">Changed Only</option>
                <option value="matched">Matched Only</option>
                <option value="warnings">Warnings Only</option>
              </select>
            </label>
          )}

          {onSortChange && (
            <label className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed flex items-center gap-1.5 font-medium">
              Sort:
              <select
                value={sort}
                onChange={(e) => onSortChange(e.target.value as PreviewSortOption)}
                className="bg-background-color-1 dark:bg-dark-background-color-2 border border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-black dark:text-font-color-white rounded px-2 py-0.5 text-xs outline-none cursor-pointer focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight transition-colors"
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
      <div className="border border-background-color-2 dark:border-dark-background-color-2 rounded-xl overflow-hidden bg-background-color-2/20 dark:bg-dark-background-color-2/30">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-background-color-2 dark:bg-dark-background-color-2 border-b border-background-color-3/30 dark:border-dark-background-color-3/30 text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs uppercase tracking-wider">
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

              const isTrackFieldSelected = !isMissing && (selectedFieldMap.get(`${match.localSongId}::trackNumber`) ?? trackDiff?.applyField ?? true);
              const isTitleFieldSelected = !isMissing && (selectedFieldMap.get(`${match.localSongId}::title`) ?? titleDiff?.applyField ?? true);
              const isArtistFieldSelected = !isMissing && (selectedFieldMap.get(`${match.localSongId}::artist`) ?? artistDiff?.applyField ?? true);

              const newTitle = titleDiff?.suggestedValue ?? match.oldTitle;
              const newArtist = artistDiff?.suggestedValue ?? match.oldArtist ?? '—';

              const isTrackChanged = trackDiff && (trackDiff.status === 'changed' || trackDiff.status === 'new') && trackDiff.suggestedValue !== undefined && Number(trackDiff.suggestedValue) !== match.oldTrackNumber;
              const oldTrackNum = match.oldTrackNumber !== undefined ? String(match.oldTrackNumber).padStart(2, '0') : String(idx + 1).padStart(2, '0');
              const newTrackNum = match.trackNumber !== undefined ? String(match.trackNumber).padStart(2, '0') : (trackDiff?.suggestedValue !== undefined ? String(trackDiff.suggestedValue).padStart(2, '0') : oldTrackNum);

              const showTrackDiff = !isMissing && isTrackChanged && isTrackFieldSelected;

              const showTitleWas = !isMissing && isTitleFieldSelected && match.oldTitle !== newTitle && Boolean(match.oldTitle);
              const displayTitle = isMissing ? (match.remoteTitle ?? match.oldTitle ?? '—') : (isTitleFieldSelected ? newTitle : match.oldTitle);

              const showArtistWas = !isMissing && isArtistFieldSelected && match.oldArtist && match.oldArtist !== newArtist && newArtist !== '—';
              const displayArtist = isMissing ? (match.remoteArtist ?? match.oldArtist ?? '—') : (isArtistFieldSelected ? newArtist : (match.oldArtist ?? '—'));

              const secondaryChangedDiffs = isMissing ? [] : match.fieldDiffs.filter((d) => {
                if (d.fieldId === 'title' || d.fieldId === 'artist' || d.fieldId === 'trackNumber') return false;
                if (d.fieldId === 'musicBrainzRecordingId' || d.fieldId === 'isrc') return false; // Exclude raw UUID/ISRC hashes from top-level compact chips
                if (d.status !== 'changed' && d.status !== 'new') return false;
                const isFieldSelected = selectedFieldMap.get(`${match.localSongId}::${d.fieldId}`) ?? d.applyField;
                return isFieldSelected;
              });

              const activeChangeCount = isMissing ? 0 : match.fieldDiffs.filter(
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
                    className={`border-b border-background-color-2/40 dark:border-dark-background-color-2/40 transition-colors text-font-color-black dark:text-font-color-white ${
                      isMissing
                        ? 'opacity-40 bg-background-color-2/10 dark:bg-dark-background-color-2/10 cursor-default'
                        : isExpanded
                        ? 'bg-background-color-2/40 dark:bg-dark-background-color-2/50 border-b-0 cursor-pointer'
                        : isFocused
                        ? 'bg-background-color-3/15 dark:bg-dark-background-color-3/15 cursor-pointer'
                        : isSelected
                        ? 'hover:bg-background-color-2/40 dark:hover:bg-dark-background-color-2/50 cursor-pointer'
                        : 'opacity-60 hover:bg-background-color-2/30 dark:hover:bg-dark-background-color-2/40 cursor-pointer'
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
                          <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed line-through text-xs">{oldTrackNum}</span>
                          <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs">→</span>
                          <span className="text-font-color-highlight dark:text-dark-font-color-highlight font-bold text-xs">{newTrackNum}</span>
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
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`font-semibold text-sm ${
                              isMissing ? 'text-font-color-dimmed dark:text-dark-font-color-dimmed italic' : showTitleWas ? 'text-font-color-highlight dark:text-dark-font-color-highlight font-bold' : 'text-font-color-black dark:text-font-color-white'
                            }`}
                          >
                            {String(displayTitle)}
                          </span>
                        </div>

                        {isMissing ? (
                          <div className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed">
                            Not in library
                          </div>
                        ) : showTitleWas ? (
                          <div className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed">
                            (was: {match.oldTitle})
                          </div>
                        ) : null}

                        {/* Secondary Field Micro-Chips (Genre, Disc, Year, etc. - excluding MBID/ISRC) */}
                        {secondaryChangedDiffs.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {secondaryChangedDiffs.map((diff) => {
                              const icon =
                                diff.fieldId === 'genre' ? '🏷️' :
                                diff.fieldId === 'discNumber' ? '💿' :
                                diff.fieldId === 'year' ? '📅' :
                                diff.fieldId === 'album' ? '💽' : '⚡';
                              return (
                                <span
                                  key={diff.fieldId}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.7rem] bg-background-color-2 dark:bg-dark-background-color-2 border border-background-color-3/30 dark:border-dark-background-color-3/30 text-font-color-dimmed dark:text-dark-font-color-dimmed"
                                >
                                  <span>{icon}</span>
                                  <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed">{diff.fieldName}:</span>
                                  {diff.status === 'new' ? (
                                    <span className="text-font-color-highlight dark:text-dark-font-color-highlight font-semibold">{String(diff.suggestedValue)}</span>
                                  ) : (
                                    <span className="text-font-color-highlight dark:text-dark-font-color-highlight font-semibold">{String(diff.oldValue ?? '')} → {String(diff.suggestedValue)}</span>
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
                            isMissing ? 'text-font-color-dimmed dark:text-dark-font-color-dimmed italic' : showArtistWas ? 'text-font-color-black dark:text-font-color-white' : 'text-font-color-dimmed dark:text-dark-font-color-dimmed'
                          }`}
                        >
                          {String(displayArtist)}
                        </span>
                        {!isMissing && showArtistWas && (
                          <div className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed">
                            (was: {match.oldArtist})
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Match Confidence Badge */}
                    <td className="px-3 py-2.5 text-center align-middle">
                      {isMissing ? (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-background-color-2 dark:bg-dark-background-color-2 border border-background-color-3/30 dark:border-dark-background-color-3/30 text-font-color-dimmed dark:text-dark-font-color-dimmed">
                          Missing
                        </span>
                      ) : (
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${statusBadge.className}`}>
                          {statusBadge.label}
                        </span>
                      )}
                    </td>

                    {/* Change Count Pill */}
                    <td className="px-3 py-2.5 text-center align-middle">
                      {isMissing ? (
                        <span className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed italic">
                          Not in library
                        </span>
                      ) : activeChangeCount > 0 ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-font-color-highlight/15 dark:bg-dark-font-color-highlight/15 border border-font-color-highlight/30 dark:border-dark-font-color-highlight/30 text-font-color-highlight dark:text-dark-font-color-highlight">
                          {activeChangeCount} {activeChangeCount === 1 ? 'change' : 'changes'}
                        </span>
                      ) : (
                        <span className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed italic">
                          No changes
                        </span>
                      )}
                    </td>

                    {/* Expand Chevron */}
                    <td className="px-2 py-2.5 text-center text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs">
                      {!isMissing ? (isExpanded ? '▲' : '▶') : null}
                    </td>
                  </tr>

                  {/* Expanded Changed-Fields Drawer */}
                  {isExpanded && (
                    <tr className="border-b border-background-color-2 dark:border-dark-background-color-2 bg-background-color-2/30 dark:bg-dark-background-color-2/40">
                      <td colSpan={7} className="px-5 py-4 pl-12">
                        <div className="flex flex-col gap-2.5">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-semibold text-font-color-dimmed dark:text-dark-font-color-dimmed uppercase tracking-wider">
                              Modified Fields for: <span className="text-font-color-highlight dark:text-dark-font-color-highlight font-bold">{match.oldTitle}</span>
                            </span>

                            {/* Deep-link to Detailed Review Mode */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenDetailed(match.localSongId);
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-background-color-2 hover:bg-background-color-3/40 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3/40 border border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-highlight dark:text-dark-font-color-highlight text-xs font-medium transition-colors cursor-pointer"
                            >
                              <span>🔍 Open in Detailed Mode</span>
                              <span>↗</span>
                            </button>
                          </div>

                          {changedDiffs.length > 0 ? (
                            <div className="flex flex-col gap-1.5">
                              {changedDiffs.map((diff) => {
                                const key = `${match.localSongId}::${diff.fieldId}`;
                                const isFieldSelected = selectedFieldMap.get(key) ?? diff.applyField;
                                const displayVal = userEditedValues.get(key) ?? diff.suggestedValue ?? '';
                                const isNew = diff.status === 'new';

                                return (
                                  <div
                                    key={diff.fieldId}
                                    onClick={() => onToggleField?.(match.localSongId, diff.fieldId)}
                                    className={`grid grid-cols-[24px_130px_1fr_20px_1fr_120px] items-center gap-2.5 px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
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

                                    <span className={`font-semibold ${isFieldSelected ? 'text-font-color-black dark:text-font-color-white' : 'text-font-color-dimmed dark:text-dark-font-color-dimmed'}`}>
                                      {diff.fieldName}
                                    </span>

                                    <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed overflow-hidden text-ellipsis whitespace-nowrap">
                                      {diff.oldValue !== undefined && diff.oldValue !== null ? String(diff.oldValue) : <em className="opacity-60">None</em>}
                                    </span>

                                    <span className="text-center text-font-color-dimmed dark:text-dark-font-color-dimmed font-bold">
                                      →
                                    </span>

                                    <span
                                      className={`font-semibold overflow-hidden text-ellipsis whitespace-nowrap ${
                                        !isFieldSelected
                                          ? 'text-font-color-dimmed dark:text-dark-font-color-dimmed line-through'
                                          : isNew
                                          ? 'text-font-color-highlight dark:text-dark-font-color-highlight'
                                          : 'text-font-color-highlight dark:text-dark-font-color-highlight'
                                      }`}
                                    >
                                      {String(displayVal)}
                                    </span>

                                    <div className="text-right">
                                      {diff.providerName && (
                                        <span className="px-2 py-0.5 rounded text-[0.7rem] font-medium bg-background-color-2 dark:bg-dark-background-color-2 border border-background-color-3/30 dark:border-dark-background-color-3/30 text-font-color-dimmed dark:text-dark-font-color-dimmed">
                                          {diff.providerName}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="p-3 rounded-lg bg-background-color-2/20 dark:bg-dark-background-color-2/30 text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs italic">
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

