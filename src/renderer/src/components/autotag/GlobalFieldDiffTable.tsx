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
      <div className="flex justify-between items-center px-1">
        <span className="text-xs font-semibold tracking-wider text-font-color-dimmed dark:text-dark-font-color-dimmed uppercase">
          Global / Album Metadata Changes
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
            Select Changed
          </button>
          <button
            type="button"
            onClick={onClear}
            className="px-2.5 py-1 rounded-md bg-background-color-2 hover:bg-background-color-3/40 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3/40 border border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-dimmed hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:text-font-color-white text-xs font-medium transition-colors cursor-pointer"
          >
            Deselect All
          </button>
        </div>
      </div>

      {/* Diff Table */}
      <div className="border border-background-color-2 dark:border-dark-background-color-2 rounded-xl overflow-hidden bg-background-color-2/20 dark:bg-dark-background-color-2/30">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-background-color-2 dark:bg-dark-background-color-2 border-b border-background-color-3/30 dark:border-dark-background-color-3/30 text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs uppercase tracking-wider">
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
                diff.status === 'changed' || diff.status === 'new'
                  ? 'bg-font-color-highlight/15 dark:bg-dark-font-color-highlight/15 border-font-color-highlight/30 dark:border-dark-font-color-highlight/30 text-font-color-highlight dark:text-dark-font-color-highlight'
                  : 'bg-background-color-2 dark:bg-dark-background-color-2 border-background-color-3/30 dark:border-dark-background-color-3/30 text-font-color-dimmed dark:text-dark-font-color-dimmed';

              return (
                <tr
                  key={diff.fieldId}
                  onClick={() => onToggleField(diff.fieldId)}
                  className={`border-b border-background-color-2/40 dark:border-dark-background-color-2/40 cursor-pointer transition-colors text-font-color-black dark:text-font-color-white ${
                    isSelected ? 'bg-background-color-3/15 dark:bg-dark-background-color-3/20' : 'hover:bg-background-color-2/40 dark:hover:bg-dark-background-color-2/50'
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
                  <td className="px-3 py-2.5 font-bold text-font-color-black dark:text-font-color-white">
                    {diff.fieldName}
                  </td>

                  {/* Current Local Value */}
                  <td className="px-3 py-2.5 text-font-color-dimmed dark:text-dark-font-color-dimmed font-medium">
                    {diff.oldValue}
                  </td>

                  {/* Arrow */}
                  <td className="px-0 py-2.5 text-center text-font-color-dimmed dark:text-dark-font-color-dimmed font-bold">
                    →
                  </td>

                  {/* Suggested Remote Value */}
                  <td className={`px-3 py-2.5 ${diff.isChanged ? 'font-bold text-font-color-highlight dark:text-dark-font-color-highlight' : 'font-medium text-font-color-black dark:text-font-color-white'}`}>
                    {diff.suggestedValue}
                  </td>

                  {/* Status Badge */}
                  <td className="px-3 py-2.5 text-right">
                    <span className={`px-2.5 py-0.5 rounded text-[0.72rem] font-bold uppercase tracking-wide border ${statusClass}`}>
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

