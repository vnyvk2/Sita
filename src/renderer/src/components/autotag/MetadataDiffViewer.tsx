import React from 'react';
import type { MetadataFieldId, TrackMatchPreview } from '../../../../common/metadata/types';
import { isFieldChanged } from './utils/previewSummary';

export interface MetadataDiffViewerProps {
  track?: TrackMatchPreview;
  match?: TrackMatchPreview;
  selectedFieldMap: Map<string, boolean>;
  userEditedValues: Map<string, string | number>;
  showChangesOnly?: boolean;
  onFieldChanged: (fieldId: MetadataFieldId, value: string | number) => void;
  onToggleField: (fieldId: MetadataFieldId) => void;
  onResetField: (fieldId: MetadataFieldId) => void;
  onSelectProviderForField?: (fieldId: MetadataFieldId, providerId: string) => void;
}

export const MetadataDiffViewer: React.FC<MetadataDiffViewerProps> = ({
  track,
  match,
  selectedFieldMap,
  userEditedValues,
  showChangesOnly = false,
  onFieldChanged,
  onToggleField,
  onResetField,
  onSelectProviderForField
}) => {
  const activeTrack = track ?? match;
  if (!activeTrack) return null;

  const visibleDiffs = showChangesOnly
    ? activeTrack.fieldDiffs.filter(isFieldChanged)
    : activeTrack.fieldDiffs;

  const getBadgeStyle = (status: string) => {
    switch (status) {
      case 'changed':
        return { className: 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400', label: 'Changed' };
      case 'new':
        return { className: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400', label: 'New' };
      case 'missing':
        return { className: 'bg-background-color-2 dark:bg-dark-background-color-2 border-background-color-3/30 dark:border-dark-background-color-3/30 text-font-color-dimmed dark:text-dark-font-color-dimmed', label: 'Missing' };
      default:
        return { className: 'bg-background-color-2/40 dark:bg-dark-background-color-2/40 border-transparent text-font-color-dimmed dark:text-dark-font-color-dimmed', label: 'Unchanged' };
    }
  };

  return (
    <div className="flex flex-col gap-3 text-font-color-black dark:text-font-color-white">
      <div className="text-xs font-semibold text-font-color-dimmed dark:text-dark-font-color-dimmed uppercase tracking-wider">
        Field Differences for: <span className="text-font-color-highlight dark:text-dark-font-color-highlight font-bold">{activeTrack.oldTitle}</span>
      </div>

      <div className="flex flex-col gap-2">
        {visibleDiffs.length === 0 ? (
          <div className="p-3 rounded-lg bg-background-color-2/20 dark:bg-dark-background-color-2/30 text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs italic">
            No modified fields for this track. Toggle &quot;All Fields&quot; to inspect unmodified tags.
          </div>
        ) : (
          visibleDiffs.map((diff) => {
            const key = `${activeTrack.localSongId}::${diff.fieldId}`;
            const isSelected = selectedFieldMap.get(key) ?? diff.applyField;
            const userVal = userEditedValues.get(key) ?? diff.userValue ?? diff.suggestedValue ?? '';
            const badge = getBadgeStyle(diff.status);
            const alternatives = diff.alternatives;

            return (
              <div
                key={diff.fieldId}
                className="grid grid-cols-[30px_120px_1fr_1fr_120px_100px_50px] items-center gap-2.5 px-3 py-2 rounded-lg bg-background-color-1 dark:bg-dark-background-color-1 border border-background-color-2 dark:border-dark-background-color-2 text-xs"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleField(diff.fieldId)}
                  className="cursor-pointer"
                />

                <span className="font-semibold text-font-color-black dark:text-font-color-white">{diff.fieldName}</span>

                <div className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed overflow-hidden text-ellipsis whitespace-nowrap font-medium">
                  {diff.oldValue !== undefined && diff.oldValue !== null ? String(diff.oldValue) : <em className="opacity-60">None</em>}
                </div>

                <input
                  type="text"
                  value={String(userVal)}
                  onChange={(e) => onFieldChanged(diff.fieldId, e.target.value)}
                  className="px-2 py-1 rounded-md bg-background-color-2/50 dark:bg-dark-background-color-2 border border-background-color-3/50 dark:border-dark-background-color-3/50 text-font-color-black dark:text-font-color-white text-xs outline-none focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight font-semibold"
                />

                {/* Provider Selector / Badge */}
                {alternatives && alternatives.length > 1 && onSelectProviderForField ? (
                  <select
                    value={diff.providerId ?? 'musicbrainz'}
                    onChange={(e) => onSelectProviderForField(diff.fieldId, e.target.value)}
                    className="text-[0.7rem] px-2 py-0.5 rounded bg-background-color-2 dark:bg-dark-background-color-2 border border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-dimmed dark:text-dark-font-color-dimmed outline-none cursor-pointer font-medium"
                  >
                    {alternatives.map((alt) => (
                      <option key={alt.providerId} value={alt.providerId} className="bg-background-color-1 dark:bg-dark-background-color-1 text-font-color-black dark:text-font-color-white">
                        {alt.providerName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div
                    title={`Source: ${diff.providerName ?? 'MusicBrainz'}`}
                    className="text-[0.7rem] px-2 py-0.5 rounded text-center font-medium bg-background-color-2 dark:bg-dark-background-color-2 border border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-dimmed dark:text-dark-font-color-dimmed overflow-hidden text-ellipsis whitespace-nowrap"
                  >
                    {diff.providerName ?? 'MusicBrainz'}
                  </div>
                )}

                <span
                  className={`text-[0.7rem] px-2 py-0.5 rounded text-center font-semibold border ${badge.className}`}
                >
                  {badge.label}
                </span>

                <button
                  type="button"
                  onClick={() => onResetField(diff.fieldId)}
                  title="Reset to suggested"
                  className="bg-transparent border-none text-font-color-dimmed hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:text-font-color-white cursor-pointer text-xs font-semibold"
                >
                  Reset
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

