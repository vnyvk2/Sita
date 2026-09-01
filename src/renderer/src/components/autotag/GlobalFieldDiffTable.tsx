import React from 'react';

import type { GlobalFieldDiff } from '../../hooks/useAlbumAutoTag';

export interface GlobalFieldDiffTableProps {
  diffs: GlobalFieldDiff[];
  selectedFields: Set<string>;
  onToggleField: (fieldId: string) => void;
  onSelectAll: () => void;
  onSelectChanged: () => void;
  onClear: () => void;
}

export const GlobalFieldDiffTable: React.FC<GlobalFieldDiffTableProps> = ({
  diffs,
  selectedFields,
  onToggleField,
  onSelectAll,
  onSelectChanged,
  onClear
}) => {
  return (
    <div className="flex flex-col gap-2">
      {/* Section Header & Bulk Buttons */}
      <div className="flex items-center justify-between px-1">
        <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs font-semibold tracking-wider uppercase">
          Global / Album Metadata Changes
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
            Select Changed
          </button>
          <button
            type="button"
            onClick={onClear}
            className="bg-background-color-2 hover:bg-background-color-3/40 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3/40 border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-dimmed hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:text-font-color-white cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
          >
            Deselect All
          </button>
        </div>
      </div>

      {/* Diff Table */}
      <div className="border-background-color-2 dark:border-dark-background-color-2 bg-background-color-2/20 dark:bg-dark-background-color-2/30 overflow-hidden rounded-xl border">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-background-color-2 dark:bg-dark-background-color-2 border-background-color-3/30 dark:border-dark-background-color-3/30 text-font-color-dimmed dark:text-dark-font-color-dimmed border-b text-xs tracking-wider uppercase">
              <th className="w-9 px-3 py-2.5 text-center"></th>
              <th className="w-36 px-3 py-2.5">FIELD</th>
              <th className="px-3 py-2.5">CURRENT (LOCAL)</th>
              <th className="w-6 px-0 py-2.5 text-center"></th>
              <th className="px-3 py-2.5">SUGGESTED (REMOTE)</th>
              <th className="w-28 px-3 py-2.5 text-right">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {diffs.map((diff, idx) => {
              const isSelected = selectedFields.has(diff.fieldId);
              const statusClass =
                diff.status === 'changed'
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400'
                  : diff.status === 'new'
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                    : 'bg-background-color-2 dark:bg-dark-background-color-2 border-background-color-3/30 dark:border-dark-background-color-3/30 text-font-color-dimmed dark:text-dark-font-color-dimmed';

              return (
                <tr
                  key={diff.fieldId}
                  onClick={() => onToggleField(diff.fieldId)}
                  className={`border-background-color-2/40 dark:border-dark-background-color-2/40 text-font-color-black dark:text-font-color-white cursor-pointer border-b transition-colors ${
                    isSelected
                      ? 'bg-background-color-3/15 dark:bg-dark-background-color-3/20'
                      : 'hover:bg-background-color-2/40 dark:hover:bg-dark-background-color-2/50'
                  }`}
                >
                  {/* Checkbox */}
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        onToggleField(diff.fieldId);
                      }}
                      className="cursor-pointer"
                    />
                  </td>

                  {/* Field Name */}
                  <td className="text-font-color-black dark:text-font-color-white px-3 py-2.5 font-bold">
                    {diff.fieldName}
                  </td>

                  {/* Current Local Value */}
                  <td className="text-font-color-dimmed dark:text-dark-font-color-dimmed px-3 py-2.5 font-medium">
                    {diff.oldValue}
                  </td>

                  {/* Arrow */}
                  <td className="text-font-color-dimmed dark:text-dark-font-color-dimmed px-0 py-2.5 text-center font-bold">
                    →
                  </td>

                  {/* Suggested Remote Value */}
                  <td
                    className={`px-3 py-2.5 ${diff.isChanged ? 'text-font-color-highlight dark:text-dark-font-color-highlight font-bold' : 'text-font-color-black dark:text-font-color-white font-medium'}`}
                  >
                    {diff.suggestedValue}
                  </td>

                  {/* Status Badge */}
                  <td className="px-3 py-2.5 text-right">
                    <span
                      className={`rounded border px-2.5 py-0.5 text-[0.72rem] font-bold tracking-wide uppercase ${statusClass}`}
                    >
                      {diff.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
