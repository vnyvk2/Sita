import React, { memo, useMemo, useState } from 'react';
import Button from '../Button';
import type { EditableField } from './types';
import { formatStringList } from './utils';
import {
  previewFindReplace,
  validateFindReplaceRegex
} from './batchTransforms/findReplace';
import type {
  BatchTransformContext,
  FindReplaceConfig
} from './batchTransforms/types';

export interface FindReplaceModalProps {
  isOpen: boolean;
  context: BatchTransformContext;
  onApply: (config: FindReplaceConfig) => void;
  onClose: () => void;
}

const AVAILABLE_FIELDS: Array<{ field: EditableField; label: string }> = [
  { field: 'title', label: 'Title' },
  { field: 'artists', label: 'Artist(s)' },
  { field: 'album', label: 'Album' },
  { field: 'albumArtists', label: 'Album Artist(s)' },
  { field: 'genres', label: 'Genre(s)' },
  { field: 'composer', label: 'Composer' }
];

export const FindReplaceModal = memo(function FindReplaceModal({
  isOpen,
  context,
  onApply,
  onClose
}: FindReplaceModalProps) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [isRegex, setIsRegex] = useState(false);
  const [matchCase, setMatchCase] = useState(false);
  const [targetFields, setTargetFields] = useState<EditableField[]>(['title', 'artists', 'album']);

  const regexValidation = useMemo(() => {
    if (!isRegex || !query) return { valid: true };
    return validateFindReplaceRegex(query, matchCase);
  }, [isRegex, query, matchCase]);

  const previews = useMemo(() => {
    if (!query || (isRegex && !regexValidation.valid) || targetFields.length === 0) {
      return [];
    }

    return previewFindReplace(context, {
      query,
      replacement,
      isRegex,
      matchCase,
      targetFields,
      allowAllWhenNoneSelected: false
    });
  }, [context, query, replacement, isRegex, matchCase, targetFields, regexValidation.valid]);

  const affectedTracksCount = useMemo(
    () => new Set(previews.map((p) => p.songId)).size,
    [previews]
  );

  if (!isOpen) return null;

  const toggleField = (field: EditableField) => {
    setTargetFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  };

  const handleApply = () => {
    if (!query || (isRegex && !regexValidation.valid) || targetFields.length === 0) {
      return;
    }

    onApply({
      query,
      replacement,
      isRegex,
      matchCase,
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
              Find & Replace
            </h2>
            <p className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed">
              Search and replace text across selected tracks with live before & after preview.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-font-color-dimmed hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:text-font-color-white cursor-pointer"
          >
            <span className="material-icons-round">close</span>
          </button>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-semibold text-font-color-black dark:text-font-color-white mb-1">
              Find
            </label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search text or pattern..."
              className="w-full rounded-lg border border-background-color-2 bg-background-color-1 px-3 py-2 text-xs text-font-color-black focus:border-font-color-highlight focus:outline-none dark:border-dark-background-color-2 dark:bg-dark-background-color-1 dark:text-font-color-white dark:focus:border-dark-font-color-highlight"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-font-color-black dark:text-font-color-white mb-1">
              Replace With
            </label>
            <input
              type="text"
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              placeholder="Replacement (e.g. $1, text)..."
              className="w-full rounded-lg border border-background-color-2 bg-background-color-1 px-3 py-2 text-xs text-font-color-black focus:border-font-color-highlight focus:outline-none dark:border-dark-background-color-2 dark:bg-dark-background-color-1 dark:text-font-color-white dark:focus:border-dark-font-color-highlight"
            />
          </div>
        </div>

        {/* Options & Regex Error */}
        <div className="flex items-center justify-between mb-3 text-xs">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 cursor-pointer text-font-color-black dark:text-font-color-white">
              <input
                type="checkbox"
                checked={matchCase}
                onChange={(e) => setMatchCase(e.target.checked)}
                className="cursor-pointer accent-font-color-highlight dark:accent-dark-font-color-highlight"
              />
              <span>Match Case</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-font-color-black dark:text-font-color-white">
              <input
                type="checkbox"
                checked={isRegex}
                onChange={(e) => setIsRegex(e.target.checked)}
                className="cursor-pointer accent-font-color-highlight dark:accent-dark-font-color-highlight"
              />
              <span>Regular Expression (Regex)</span>
            </label>
          </div>

          {isRegex && !regexValidation.valid && (
            <span className="text-red-500 font-medium truncate max-w-[250px]">
              {regexValidation.error}
            </span>
          )}
        </div>

        {/* Target Columns */}
        <div className="mb-4 rounded-xl border border-background-color-2/60 bg-background-color-2/20 p-2.5 dark:border-dark-background-color-2/60 dark:bg-dark-background-color-2/20">
          <p className="text-xs font-semibold text-font-color-black dark:text-font-color-white mb-1.5">
            Target Columns:
          </p>
          <div className="flex flex-wrap gap-3">
            {AVAILABLE_FIELDS.map(({ field, label }) => (
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
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Live Preview Section */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-font-color-black dark:text-font-color-white">
              Preview Matches ({affectedTracksCount} tracks affected &middot; {previews.length} fields changed)
            </span>
          </div>

          <div className="max-h-48 overflow-y-auto rounded-xl border border-background-color-2 bg-background-color-2/10 p-2 text-xs dark:border-dark-background-color-2 dark:bg-dark-background-color-2/10">
            {previews.length === 0 ? (
              <p className="text-center py-6 text-font-color-dimmed dark:text-dark-font-color-dimmed italic">
                {query ? 'No matching text found in target columns.' : 'Enter search text to preview matches.'}
              </p>
            ) : (
              <div className="space-y-1.5">
                {previews.slice(0, 50).map((p, idx) => (
                  <div
                    key={`${p.songId}-${p.field}-${idx}`}
                    className="flex items-center justify-between rounded-lg bg-background-color-1 p-2 dark:bg-dark-background-color-1 border border-background-color-2/40 dark:border-dark-background-color-2/40"
                  >
                    <span className="font-medium text-font-color-dimmed dark:text-dark-font-color-dimmed w-24 truncate">
                      {p.field}:
                    </span>
                    <div className="flex items-center gap-2 flex-1 justify-end truncate">
                      <span className="text-red-400 line-through truncate max-w-[200px]">
                        {formatDisplay(p.before)}
                      </span>
                      <span className="material-icons-round text-xs text-font-color-dimmed">arrow_forward</span>
                      <span className="text-emerald-400 font-medium truncate max-w-[200px]">
                        {formatDisplay(p.after)}
                      </span>
                    </div>
                  </div>
                ))}
                {previews.length > 50 && (
                  <p className="text-center text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed pt-1">
                    ...and {previews.length - 50} more changes.
                  </p>
                )}
              </div>
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
            label={`Replace (${previews.length} Changes)`}
            clickHandler={handleApply}
            isDisabled={previews.length === 0}
            className="bg-font-color-highlight dark:bg-dark-font-color-highlight text-white text-xs px-4 py-2 rounded-lg font-medium cursor-pointer disabled:opacity-40"
          />
        </div>
      </div>
    </div>
  );
});

export default FindReplaceModal;
