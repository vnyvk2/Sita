import { memo, useState } from 'react';

import Button from '../Button';

export interface BulkOperationsBarProps {
  totalCount: number;
  selectedCount: number;
  modifiedCount: number;
  hasSelectedDirtyRows: boolean;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onInvertSelection: () => void;
  onSelectModifiedOnly: () => void;
  onAutoNumber: () => void;
  onOpenBulkSet: () => void;
  onOpenCaseConvert: () => void;
  onOpenFindReplace: () => void;
  onOpenPatternParser: () => void;
  onRevertSelected: () => void;
}

export const BulkOperationsBar = memo(function BulkOperationsBar({
  selectedCount,
  hasSelectedDirtyRows,
  onSelectAll,
  onDeselectAll,
  onInvertSelection,
  onSelectModifiedOnly,
  onAutoNumber,
  onOpenBulkSet,
  onOpenCaseConvert,
  onOpenFindReplace,
  onOpenPatternParser,
  onRevertSelected
}: BulkOperationsBarProps) {
  const [showSelectMenu, setShowSelectMenu] = useState(false);
  const isSelectionActive = selectedCount > 0;

  return (
    <div className="border-background-color-2/50 bg-background-color-2/20 dark:border-dark-background-color-2/50 dark:bg-dark-background-color-2/20 flex flex-wrap items-center justify-between gap-2 border-b px-6 py-2">
      {/* Left: Selection Dropdown & Action Buttons */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Selection menu button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowSelectMenu((prev) => !prev)}
            className="text-font-color-black hover:bg-background-color-2 dark:text-font-color-white dark:hover:bg-dark-background-color-2 flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition"
            aria-label="Selection options"
          >
            <span className="material-icons-round text-sm">checklist</span>
            <span>Select</span>
            <span className="material-icons-round text-xs">expand_more</span>
          </button>

          {showSelectMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowSelectMenu(false)} />
              <div className="border-background-color-2 bg-background-color-1 dark:border-dark-background-color-2 dark:bg-dark-background-color-1 absolute top-full left-0 z-50 mt-1 w-44 rounded-xl border p-1.5 shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    onSelectAll();
                    setShowSelectMenu(false);
                  }}
                  className="text-font-color-black hover:bg-background-color-2 dark:text-font-color-white dark:hover:bg-dark-background-color-2 flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium"
                >
                  <span className="material-icons-round text-xs">select_all</span>
                  <span>Select All</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDeselectAll();
                    setShowSelectMenu(false);
                  }}
                  className="text-font-color-black hover:bg-background-color-2 dark:text-font-color-white dark:hover:bg-dark-background-color-2 flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium"
                >
                  <span className="material-icons-round text-xs">deselect</span>
                  <span>Deselect All</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onInvertSelection();
                    setShowSelectMenu(false);
                  }}
                  className="text-font-color-black hover:bg-background-color-2 dark:text-font-color-white dark:hover:bg-dark-background-color-2 flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium"
                >
                  <span className="material-icons-round text-xs">swap_horiz</span>
                  <span>Invert Selection</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSelectModifiedOnly();
                    setShowSelectMenu(false);
                  }}
                  className="text-font-color-black hover:bg-background-color-2 dark:text-font-color-white dark:hover:bg-dark-background-color-2 flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium"
                >
                  <span className="material-icons-round text-xs text-amber-500">edit</span>
                  <span>Select Modified Only</span>
                </button>
              </div>
            </>
          )}
        </div>

        <div className="bg-background-color-2 dark:bg-dark-background-color-2 mx-1 h-4 w-[1px]" />

        {/* Auto-number */}
        <Button
          label={isSelectionActive ? `Auto-number (${selectedCount})` : 'Auto-number 1..N'}
          iconName="format_list_numbered"
          clickHandler={onAutoNumber}
          className="hover:bg-background-color-2 dark:hover:bg-dark-background-color-2 text-font-color-black dark:text-font-color-white cursor-pointer rounded-lg bg-transparent px-2.5 py-1.5 text-xs font-medium transition"
        />

        {/* Set Common Values */}
        <Button
          label="Set Values..."
          iconName="tune"
          clickHandler={onOpenBulkSet}
          isDisabled={!isSelectionActive}
          className="hover:bg-background-color-2 dark:hover:bg-dark-background-color-2 text-font-color-black dark:text-font-color-white cursor-pointer rounded-lg bg-transparent px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-40"
        />

        {/* Case Converter */}
        <Button
          label="Case Convert..."
          iconName="text_fields"
          clickHandler={onOpenCaseConvert}
          isDisabled={!isSelectionActive}
          className="hover:bg-background-color-2 dark:hover:bg-dark-background-color-2 text-font-color-black dark:text-font-color-white cursor-pointer rounded-lg bg-transparent px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-40"
        />

        {/* Find & Replace */}
        <Button
          label="Find & Replace..."
          iconName="find_replace"
          clickHandler={onOpenFindReplace}
          isDisabled={!isSelectionActive}
          className="hover:bg-background-color-2 dark:hover:bg-dark-background-color-2 text-font-color-black dark:text-font-color-white cursor-pointer rounded-lg bg-transparent px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-40"
        />

        {/* Parse from filenames */}
        <Button
          label="From Filenames..."
          iconName="badge"
          clickHandler={onOpenPatternParser}
          isDisabled={!isSelectionActive}
          className="hover:bg-background-color-2 dark:hover:bg-dark-background-color-2 text-font-color-black dark:text-font-color-white cursor-pointer rounded-lg bg-transparent px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-40"
        />
      </div>

      {/* Right: Revert Selected */}
      {isSelectionActive && hasSelectedDirtyRows && (
        <div>
          <Button
            label="Revert Selected"
            iconName="undo"
            clickHandler={onRevertSelected}
            className="cursor-pointer rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-500 transition hover:bg-red-500/20"
          />
        </div>
      )}
    </div>
  );
});

export default BulkOperationsBar;
