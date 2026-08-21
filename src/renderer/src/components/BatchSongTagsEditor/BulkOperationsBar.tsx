import React, { memo, useState } from 'react';
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
  totalCount,
  selectedCount,
  modifiedCount,
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
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-background-color-2/50 px-6 py-2 bg-background-color-2/20 dark:border-dark-background-color-2/50 dark:bg-dark-background-color-2/20">
      {/* Left: Selection Dropdown & Action Buttons */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Selection menu button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowSelectMenu((prev) => !prev)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-font-color-black transition hover:bg-background-color-2 dark:text-font-color-white dark:hover:bg-dark-background-color-2 cursor-pointer"
            aria-label="Selection options"
          >
            <span className="material-icons-round text-sm">checklist</span>
            <span>Select</span>
            <span className="material-icons-round text-xs">expand_more</span>
          </button>

          {showSelectMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowSelectMenu(false)}
              />
              <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-xl border border-background-color-2 bg-background-color-1 p-1.5 shadow-xl dark:border-dark-background-color-2 dark:bg-dark-background-color-1">
                <button
                  type="button"
                  onClick={() => {
                    onSelectAll();
                    setShowSelectMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-font-color-black hover:bg-background-color-2 dark:text-font-color-white dark:hover:bg-dark-background-color-2 cursor-pointer"
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
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-font-color-black hover:bg-background-color-2 dark:text-font-color-white dark:hover:bg-dark-background-color-2 cursor-pointer"
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
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-font-color-black hover:bg-background-color-2 dark:text-font-color-white dark:hover:bg-dark-background-color-2 cursor-pointer"
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
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-font-color-black hover:bg-background-color-2 dark:text-font-color-white dark:hover:bg-dark-background-color-2 cursor-pointer"
                >
                  <span className="material-icons-round text-xs text-amber-500">edit</span>
                  <span>Select Modified Only</span>
                </button>
              </div>
            </>
          )}
        </div>

        <div className="h-4 w-[1px] bg-background-color-2 dark:bg-dark-background-color-2 mx-1" />

        {/* Auto-number */}
        <Button
          label={isSelectionActive ? `Auto-number (${selectedCount})` : 'Auto-number 1..N'}
          iconName="format_list_numbered"
          clickHandler={onAutoNumber}
          className="bg-transparent hover:bg-background-color-2 dark:hover:bg-dark-background-color-2 text-font-color-black dark:text-font-color-white text-xs px-2.5 py-1.5 rounded-lg font-medium transition cursor-pointer"
        />

        {/* Set Common Values */}
        <Button
          label="Set Values..."
          iconName="tune"
          clickHandler={onOpenBulkSet}
          isDisabled={!isSelectionActive}
          className="bg-transparent hover:bg-background-color-2 dark:hover:bg-dark-background-color-2 text-font-color-black dark:text-font-color-white text-xs px-2.5 py-1.5 rounded-lg font-medium transition cursor-pointer disabled:opacity-40"
        />

        {/* Case Converter */}
        <Button
          label="Case Convert..."
          iconName="text_fields"
          clickHandler={onOpenCaseConvert}
          isDisabled={!isSelectionActive}
          className="bg-transparent hover:bg-background-color-2 dark:hover:bg-dark-background-color-2 text-font-color-black dark:text-font-color-white text-xs px-2.5 py-1.5 rounded-lg font-medium transition cursor-pointer disabled:opacity-40"
        />

        {/* Find & Replace */}
        <Button
          label="Find & Replace..."
          iconName="find_replace"
          clickHandler={onOpenFindReplace}
          isDisabled={!isSelectionActive}
          className="bg-transparent hover:bg-background-color-2 dark:hover:bg-dark-background-color-2 text-font-color-black dark:text-font-color-white text-xs px-2.5 py-1.5 rounded-lg font-medium transition cursor-pointer disabled:opacity-40"
        />

        {/* Parse from filenames */}
        <Button
          label="From Filenames..."
          iconName="badge"
          clickHandler={onOpenPatternParser}
          isDisabled={!isSelectionActive}
          className="bg-transparent hover:bg-background-color-2 dark:hover:bg-dark-background-color-2 text-font-color-black dark:text-font-color-white text-xs px-2.5 py-1.5 rounded-lg font-medium transition cursor-pointer disabled:opacity-40"
        />
      </div>

      {/* Right: Revert Selected */}
      {isSelectionActive && hasSelectedDirtyRows && (
        <div>
          <Button
            label="Revert Selected"
            iconName="undo"
            clickHandler={onRevertSelected}
            className="bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs px-2.5 py-1.5 rounded-lg font-medium transition cursor-pointer"
          />
        </div>
      )}
    </div>
  );
});

export default BulkOperationsBar;
