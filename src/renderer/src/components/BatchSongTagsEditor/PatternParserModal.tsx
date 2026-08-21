import React, { memo, useMemo, useState } from 'react';
import Button from '../Button';
import type { EditableField } from './types';
import { formatStringList } from './utils';
import { previewPatternParser } from './batchTransforms/patternParser';
import type {
  BatchTransformContext,
  PatternParserConfig
} from './batchTransforms/types';

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
  { label: '%artist% - %album%/%track% - %title%', pattern: '%artist% - %album%/%track% - %title%' },
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-background-color-1 p-6 shadow-2xl dark:bg-dark-background-color-1 border border-background-color-2 dark:border-dark-background-color-2">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-font-color-black dark:text-font-color-white">
              Extract Tags from File Paths
            </h2>
            <p className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed">
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
          <label className="block text-xs font-semibold text-font-color-black dark:text-font-color-white mb-1">
            Filename / Path Pattern
          </label>
          <input
            type="text"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="e.g. %track% - %artist% - %title%"
            className="w-full rounded-lg border border-background-color-2 bg-background-color-1 px-3 py-2 text-xs font-mono text-font-color-black focus:border-font-color-highlight focus:outline-none dark:border-dark-background-color-2 dark:bg-dark-background-color-1 dark:text-font-color-white dark:focus:border-dark-font-color-highlight"
          />

          {/* Quick Preset Buttons */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="text-[11px] font-medium text-font-color-dimmed dark:text-dark-font-color-dimmed self-center mr-1">
              Presets:
            </span>
            {PRESETS.map((p) => (
              <button
                key={p.pattern}
                type="button"
                onClick={() => setPattern(p.pattern)}
                className={`rounded-md px-2 py-0.5 text-[11px] font-mono transition cursor-pointer ${
                  pattern === p.pattern
                    ? 'bg-font-color-highlight text-white dark:bg-dark-font-color-highlight'
                    : 'bg-background-color-2/50 text-font-color-dimmed hover:text-font-color-black dark:bg-dark-background-color-2/50 dark:hover:text-font-color-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Target Columns Checkboxes */}
        <div className="mb-3 rounded-xl border border-background-color-2/60 bg-background-color-2/20 p-2.5 dark:border-dark-background-color-2/60 dark:bg-dark-background-color-2/20">
          <p className="text-xs font-semibold text-font-color-black dark:text-font-color-white mb-1.5">
            Apply Parsed Fields:
          </p>
          <div className="flex flex-wrap gap-3">
            {AVAILABLE_FIELDS.map(({ field, label, token }) => (
              <label
                key={field}
                className="flex items-center gap-1.5 text-xs text-font-color-dimmed hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:text-font-color-white cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={targetFields.includes(field)}
                  onChange={() => toggleField(field)}
                  className="cursor-pointer accent-font-color-highlight dark:accent-dark-font-color-highlight"
                />
                <span>{label} <span className="font-mono text-[10px] text-font-color-dimmed/70">({token})</span></span>
              </label>
            ))}
          </div>
        </div>

        {/* Parse Match Stats Banner */}
        <div className="flex items-center justify-between mb-2 rounded-lg bg-background-color-2/30 px-3 py-1.5 text-xs dark:bg-dark-background-color-2/30">
          <span className="font-medium text-font-color-black dark:text-font-color-white">
            Matches: {matchedCount} of {totalTargeted} files ({matchPercentage}%)
          </span>
          {matchedCount === 0 && totalTargeted > 0 && (
            <span className="text-amber-500 font-medium text-xs">
              No filenames match pattern format
            </span>
          )}
        </div>

        {/* Live Preview List */}
        <div className="mb-4">
          <div className="max-h-44 overflow-y-auto rounded-xl border border-background-color-2 bg-background-color-2/10 p-2 text-xs dark:border-dark-background-color-2 dark:bg-dark-background-color-2/10 space-y-1.5">
            {previews.length === 0 ? (
              <p className="text-center py-6 text-font-color-dimmed dark:text-dark-font-color-dimmed italic">
                Enter a pattern to preview metadata extraction.
              </p>
            ) : (
              previews.slice(0, 40).map((p) => (
                <div
                  key={p.songId}
                  className={`flex flex-col gap-1 rounded-lg p-2 border ${
                    p.matched
                      ? 'bg-background-color-1 dark:bg-dark-background-color-1 border-background-color-2/40 dark:border-dark-background-color-2/40'
                      : 'bg-amber-500/5 border-amber-500/20'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] text-font-color-dimmed dark:text-dark-font-color-dimmed font-mono truncate">
                    <span className="truncate">{p.path}</span>
                    <span className={p.matched ? 'text-emerald-500 font-semibold' : 'text-amber-500'}>
                      {p.matched ? 'MATCHED' : 'UNMATCHED'}
                    </span>
                  </div>

                  {p.matched && (
                    <div className="flex flex-wrap gap-2 text-xs pt-1 border-t border-background-color-2/30 dark:border-dark-background-color-2/30">
                      {Object.entries(p.fields).map(([k, v]) => (
                        <span key={k} className="inline-flex items-center gap-1 rounded bg-background-color-2/50 px-1.5 py-0.5 dark:bg-dark-background-color-2/50">
                          <span className="text-font-color-dimmed font-medium">{k}:</span>
                          <span className="text-emerald-400 font-semibold">{formatDisplay(v)}</span>
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
            className="bg-transparent hover:bg-background-color-2 dark:hover:bg-dark-background-color-2 text-font-color-black dark:text-font-color-white text-xs px-4 py-2 rounded-lg font-medium cursor-pointer"
          />
          <Button
            label={`Apply Parsed Tags (${matchedCount} Files)`}
            clickHandler={handleApply}
            isDisabled={matchedCount === 0}
            className="bg-font-color-highlight dark:bg-dark-font-color-highlight text-white text-xs px-4 py-2 rounded-lg font-medium cursor-pointer disabled:opacity-40"
          />
        </div>
      </div>
    </div>
  );
});

export default PatternParserModal;
