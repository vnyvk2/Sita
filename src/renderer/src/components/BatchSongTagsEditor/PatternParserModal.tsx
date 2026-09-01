import React, { memo, useMemo, useState } from 'react';

import Button from '../Button';
import { previewPatternParser } from './batchTransforms/patternParser';
import type { BatchTransformContext, PatternParserConfig } from './batchTransforms/types';
import type { EditableField } from './types';
import { formatStringList } from './utils';

export interface PatternParserModalProps {
  isOpen: boolean;
  context: BatchTransformContext;
  onApply: (config: PatternParserConfig) => void;
  onClose: () => void;
}

const PRESETS = [
  { label: '%track% - %artist% - %title%', pattern: '%track% - %artist% - %title%' },
  { label: '%track% - %title%', pattern: '%track% - %title%' },
  { label: '%track%. %title%', pattern: '%track%. %title%' },
  {
    label: '%artist% - %album%/%track% - %title%',
    pattern: '%artist% - %album%/%track% - %title%'
  },
  { label: '%disc%-%track% %title%', pattern: '%disc%-%track% %title%' }
];

const AVAILABLE_FIELDS: Array<{ field: EditableField; label: string; token: string }> = [
  { field: 'trackNumber', label: 'Track #', token: '%track%' },
  { field: 'title', label: 'Title', token: '%title%' },
  { field: 'artists', label: 'Artist(s)', token: '%artist%' },
  { field: 'album', label: 'Album', token: '%album%' },
  { field: 'albumArtists', label: 'Album Artist', token: '%albumartist%' },
  { field: 'year', label: 'Year', token: '%year%' },
  { field: 'discNumber', label: 'Disc #', token: '%disc%' }
];

export const PatternParserModal = memo(function PatternParserModal({
  isOpen,
  context,
  onApply,
  onClose
}: PatternParserModalProps) {
  const [pattern, setPattern] = useState('%track% - %artist% - %title%');
  const [targetFields, setTargetFields] = useState<EditableField[]>([
    'trackNumber',
    'title',
    'artists',
    'album'
  ]);

  const previews = useMemo(() => {
    if (!pattern.trim() || targetFields.length === 0) return [];

    return previewPatternParser(context, {
      pattern,
      targetFields,
      allowAllWhenNoneSelected: false
    });
  }, [context, pattern, targetFields]);

  if (!isOpen) return null;

  const matchedCount = previews.filter((p) => p.matched).length;
  const totalTargeted = previews.length;
  const matchPercentage = totalTargeted > 0 ? Math.round((matchedCount / totalTargeted) * 100) : 0;

  const toggleField = (field: EditableField) => {
    setTargetFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  };

  const handleApply = () => {
    if (matchedCount === 0 || targetFields.length === 0) return;

    onApply({
      pattern,
      targetFields,
      allowAllWhenNoneSelected: false
    });
    onClose();
  };

  const formatDisplay = (val: unknown) => {
    if (Array.isArray(val)) return formatStringList(val);
    return val === undefined || val === null ? '' : String(val);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="bg-background-color-1 dark:bg-dark-background-color-1 border-background-color-2 dark:border-dark-background-color-2 w-full max-w-2xl rounded-2xl border p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-font-color-black dark:text-font-color-white text-lg font-semibold">
              Extract Tags from File Paths
            </h2>
            <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs">
              Parse metadata tokens from audio file paths into draft tags.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-font-color-dimmed hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:text-font-color-white cursor-pointer"
          >
            <span className="material-icons-round">close</span>
          </button>
        </div>

        {/* Pattern Input & Presets */}
        <div className="mb-3">
          <label className="text-font-color-black dark:text-font-color-white mb-1 block text-xs font-semibold">
            Filename / Path Pattern
          </label>
          <input
            type="text"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="e.g. %track% - %artist% - %title%"
            className="border-background-color-2 bg-background-color-1 text-font-color-black focus:border-font-color-highlight dark:border-dark-background-color-2 dark:bg-dark-background-color-1 dark:text-font-color-white dark:focus:border-dark-font-color-highlight w-full rounded-lg border px-3 py-2 font-mono text-xs focus:outline-none"
          />

          {/* Quick Preset Buttons */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed mr-1 self-center text-[11px] font-medium">
              Presets:
            </span>
            {PRESETS.map((p) => (
              <button
                key={p.pattern}
                type="button"
                onClick={() => setPattern(p.pattern)}
                className={`cursor-pointer rounded-md px-2 py-0.5 font-mono text-[11px] transition ${
                  pattern === p.pattern
                    ? 'bg-font-color-highlight dark:bg-dark-font-color-highlight text-white'
                    : 'bg-background-color-2/50 text-font-color-dimmed hover:text-font-color-black dark:bg-dark-background-color-2/50 dark:hover:text-font-color-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Target Columns Checkboxes */}
        <div className="border-background-color-2/60 bg-background-color-2/20 dark:border-dark-background-color-2/60 dark:bg-dark-background-color-2/20 mb-3 rounded-xl border p-2.5">
          <p className="text-font-color-black dark:text-font-color-white mb-1.5 text-xs font-semibold">
            Apply Parsed Fields:
          </p>
          <div className="flex flex-wrap gap-3">
            {AVAILABLE_FIELDS.map(({ field, label, token }) => (
              <label
                key={field}
                className="text-font-color-dimmed hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:text-font-color-white flex cursor-pointer items-center gap-1.5 text-xs select-none"
              >
                <input
                  type="checkbox"
                  checked={targetFields.includes(field)}
                  onChange={() => toggleField(field)}
                  className="accent-font-color-highlight dark:accent-dark-font-color-highlight cursor-pointer"
                />
                <span>
                  {label}{' '}
                  <span className="text-font-color-dimmed/70 font-mono text-[10px]">({token})</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Parse Match Stats Banner */}
        <div className="bg-background-color-2/30 dark:bg-dark-background-color-2/30 mb-2 flex items-center justify-between rounded-lg px-3 py-1.5 text-xs">
          <span className="text-font-color-black dark:text-font-color-white font-medium">
            Matches: {matchedCount} of {totalTargeted} files ({matchPercentage}%)
          </span>
          {matchedCount === 0 && totalTargeted > 0 && (
            <span className="text-xs font-medium text-amber-500">
              No filenames match pattern format
            </span>
          )}
        </div>

        {/* Live Preview List */}
        <div className="mb-4">
          <div className="border-background-color-2 bg-background-color-2/10 dark:border-dark-background-color-2 dark:bg-dark-background-color-2/10 max-h-44 space-y-1.5 overflow-y-auto rounded-xl border p-2 text-xs">
            {previews.length === 0 ? (
              <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed py-6 text-center italic">
                Enter a pattern to preview metadata extraction.
              </p>
            ) : (
              previews.slice(0, 40).map((p) => (
                <div
                  key={p.songId}
                  className={`flex flex-col gap-1 rounded-lg border p-2 ${
                    p.matched
                      ? 'bg-background-color-1 dark:bg-dark-background-color-1 border-background-color-2/40 dark:border-dark-background-color-2/40'
                      : 'border-amber-500/20 bg-amber-500/5'
                  }`}
                >
                  <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed flex items-center justify-between truncate font-mono text-[11px]">
                    <span className="truncate">{p.path}</span>
                    <span
                      className={p.matched ? 'font-semibold text-emerald-500' : 'text-amber-500'}
                    >
                      {p.matched ? 'MATCHED' : 'UNMATCHED'}
                    </span>
                  </div>

                  {p.matched && (
                    <div className="border-background-color-2/30 dark:border-dark-background-color-2/30 flex flex-wrap gap-2 border-t pt-1 text-xs">
                      {Object.entries(p.fields).map(([k, v]) => (
                        <span
                          key={k}
                          className="bg-background-color-2/50 dark:bg-dark-background-color-2/50 inline-flex items-center gap-1 rounded px-1.5 py-0.5"
                        >
                          <span className="text-font-color-dimmed font-medium">{k}:</span>
                          <span className="font-semibold text-emerald-400">{formatDisplay(v)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2">
          <Button
            label="Cancel"
            clickHandler={onClose}
            className="hover:bg-background-color-2 dark:hover:bg-dark-background-color-2 text-font-color-black dark:text-font-color-white cursor-pointer rounded-lg bg-transparent px-4 py-2 text-xs font-medium"
          />
          <Button
            label={`Apply Parsed Tags (${matchedCount} Files)`}
            clickHandler={handleApply}
            isDisabled={matchedCount === 0}
            className="bg-font-color-highlight dark:bg-dark-font-color-highlight cursor-pointer rounded-lg px-4 py-2 text-xs font-medium text-white disabled:opacity-40"
          />
        </div>
      </div>
    </div>
  );
});

export default PatternParserModal;
