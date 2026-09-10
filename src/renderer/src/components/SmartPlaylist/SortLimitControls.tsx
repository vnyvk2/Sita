import type { OrderDefinition, SmartPlaylistField } from '@common/collections/smartPlaylist';
import { SMART_PLAYLIST_FIELDS } from '@common/collections/smartPlaylist';
import { memo } from 'react';

interface SortLimitControlsProps {
  orderBy: OrderDefinition[];
  onChangeOrderBy: (updated: OrderDefinition[]) => void;
  maxEntries?: number | null;
  onChangeMaxEntries: (updated: number | null) => void;
}

export const SortLimitControls = memo(
  ({ orderBy, onChangeOrderBy, maxEntries, onChangeMaxEntries }: SortLimitControlsProps) => {
    const sortableFields = Object.values(SMART_PLAYLIST_FIELDS).filter((f) => f.sortable);
    const currentSort = orderBy[0] ?? { field: 'addedAt', direction: 'desc' };

    const handleSortFieldChange = (field: SmartPlaylistField) => {
      onChangeOrderBy([{ field, direction: currentSort.direction }, ...orderBy.slice(1)]);
    };

    const handleDirectionToggle = () => {
      onChangeOrderBy([
        {
          field: currentSort.field,
          direction: currentSort.direction === 'asc' ? 'desc' : 'asc'
        },
        ...orderBy.slice(1)
      ]);
    };

    const handleLimitToggle = (checked: boolean) => {
      onChangeMaxEntries(checked ? 50 : null);
    };

    return (
      <div className="bg-background-color-1/70 dark:bg-dark-background-color-1/70 rounded-xl border border-black/5 p-4 dark:border-white/5">
        <h4 className="text-font-color-black/70 dark:text-font-color-white/70 mb-3 text-xs font-semibold tracking-wider uppercase">
          Sorting &amp; Limits
        </h4>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          {/* Sort By Field */}
          <div className="flex items-center gap-2">
            <span className="text-font-color-black/60 dark:text-font-color-white/60 text-xs">
              Order by:
            </span>
            <select
              value={currentSort.field}
              onChange={(e) => handleSortFieldChange(e.target.value as SmartPlaylistField)}
              className="bg-background-color-2 text-font-color-black dark:bg-dark-background-color-2 dark:text-font-color-white focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight h-9 rounded-lg border border-black/10 px-3 py-1 font-medium outline-hidden transition-colors dark:border-white/10"
            >
              {sortableFields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>

            {/* Direction Toggle */}
            <button
              type="button"
              onClick={handleDirectionToggle}
              className="bg-background-color-2 hover:bg-background-color-3 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3 flex h-9 cursor-pointer items-center gap-1 rounded-lg border border-black/10 px-3 py-1 text-xs font-semibold transition-colors dark:border-white/10"
              title={currentSort.direction === 'asc' ? 'Ascending' : 'Descending'}
            >
              <span className="material-icons-round text-base">
                {currentSort.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}
              </span>
              {currentSort.direction === 'asc' ? 'ASC' : 'DESC'}
            </button>
          </div>

          <div className="hidden h-6 w-px bg-black/10 sm:block dark:bg-white/10" />

          {/* Max Songs Limit */}
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
              <input
                type="checkbox"
                checked={maxEntries !== null && maxEntries !== undefined && maxEntries > 0}
                onChange={(e) => handleLimitToggle(e.target.checked)}
                className="accent-font-color-highlight h-4 w-4 rounded"
              />
              <span className="text-font-color-black/80 dark:text-font-color-white/80">
                Limit playlist size:
              </span>
            </label>

            {maxEntries !== null && maxEntries !== undefined && maxEntries > 0 && (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={5000}
                  value={maxEntries}
                  onChange={(e) =>
                    onChangeMaxEntries(
                      e.target.value === '' ? null : Math.max(1, Number(e.target.value))
                    )
                  }
                  className="bg-background-color-2 text-font-color-black dark:bg-dark-background-color-2 dark:text-font-color-white focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight h-9 w-20 rounded-lg border border-black/10 px-2 py-1 text-center font-semibold outline-hidden transition-colors dark:border-white/10"
                />
                <span className="text-font-color-black/60 dark:text-font-color-white/60 text-xs">
                  songs
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

SortLimitControls.displayName = 'SortLimitControls';
