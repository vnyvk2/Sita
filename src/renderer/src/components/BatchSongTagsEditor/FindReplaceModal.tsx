import React, { memo, useMemo, useState } from 'react';

import Button from '../Button';
import { previewFindReplace, validateFindReplaceRegex } from './batchTransforms/findReplace';
import type { BatchTransformContext, FindReplaceConfig } from './batchTransforms/types';
import type { EditableField } from './types';
import { formatStringList } from './utils';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="bg-background-color-1 dark:bg-dark-background-color-1 border-background-color-2 dark:border-dark-background-color-2 w-full max-w-2xl rounded-2xl border p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-font-color-black dark:text-font-color-white text-lg font-semibold">
              Find & Replace
            </h2>
            <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs">
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
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="text-font-color-black dark:text-font-color-white mb-1 block text-xs font-semibold">
              Find
            </label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search text or pattern..."
              className="border-background-color-2 bg-background-color-1 text-font-color-black focus:border-font-color-highlight dark:border-dark-background-color-2 dark:bg-dark-background-color-1 dark:text-font-color-white dark:focus:border-dark-font-color-highlight w-full rounded-lg border px-3 py-2 text-xs focus:outline-none"
            />
          </div>
          <div>
            <label className="text-font-color-black dark:text-font-color-white mb-1 block text-xs font-semibold">
              Replace With
            </label>
            <input
              type="text"
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              placeholder="Replacement (e.g. $1, text)..."
              className="border-background-color-2 bg-background-color-1 text-font-color-black focus:border-font-color-highlight dark:border-dark-background-color-2 dark:bg-dark-background-color-1 dark:text-font-color-white dark:focus:border-dark-font-color-highlight w-full rounded-lg border px-3 py-2 text-xs focus:outline-none"
            />
          </div>
        </div>

        {/* Options & Regex Error */}
        <div className="mb-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <label className="text-font-color-black dark:text-font-color-white flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={matchCase}
                onChange={(e) => setMatchCase(e.target.checked)}
                className="accent-font-color-highlight dark:accent-dark-font-color-highlight cursor-pointer"
              />
              <span>Match Case</span>
            </label>
            <label className="text-font-color-black dark:text-font-color-white flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={isRegex}
                onChange={(e) => setIsRegex(e.target.checked)}
                className="accent-font-color-highlight dark:accent-dark-font-color-highlight cursor-pointer"
              />
              <span>Regular Expression (Regex)</span>
            </label>
          </div>

          {isRegex && !regexValidation.valid && (
            <span className="max-w-[250px] truncate font-medium text-red-500">
              {regexValidation.error}
            </span>
          )}
        </div>

        {/* Target Columns */}
        <div className="border-background-color-2/60 bg-background-color-2/20 dark:border-dark-background-color-2/60 dark:bg-dark-background-color-2/20 mb-4 rounded-xl border p-2.5">
          <p className="text-font-color-black dark:text-font-color-white mb-1.5 text-xs font-semibold">
            Target Columns:
          </p>
          <div className="flex flex-wrap gap-3">
            {AVAILABLE_FIELDS.map(({ field, label }) => (
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
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Live Preview Section */}
        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-font-color-black dark:text-font-color-white text-xs font-semibold">
              Preview Matches ({affectedTracksCount} tracks affected &middot; {previews.length}{' '}
              fields changed)
            </span>
          </div>

          <div className="border-background-color-2 bg-background-color-2/10 dark:border-dark-background-color-2 dark:bg-dark-background-color-2/10 max-h-48 overflow-y-auto rounded-xl border p-2 text-xs">
            {previews.length === 0 ? (
              <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed py-6 text-center italic">
                {query
                  ? 'No matching text found in target columns.'
                  : 'Enter search text to preview matches.'}
              </p>
            ) : (
              <div className="space-y-1.5">
                {previews.slice(0, 50).map((p, idx) => (
                  <div
                    key={`${p.songId}-${p.field}-${idx}`}
                    className="bg-background-color-1 dark:bg-dark-background-color-1 border-background-color-2/40 dark:border-dark-background-color-2/40 flex items-center justify-between rounded-lg border p-2"
                  >
                    <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed w-24 truncate font-medium">
                      {p.field}:
                    </span>
                    <div className="flex flex-1 items-center justify-end gap-2 truncate">
                      <span className="max-w-[200px] truncate text-red-400 line-through">
                        {formatDisplay(p.before)}
                      </span>
                      <span className="material-icons-round text-font-color-dimmed text-xs">
                        arrow_forward
                      </span>
                      <span className="max-w-[200px] truncate font-medium text-emerald-400">
                        {formatDisplay(p.after)}
                      </span>
                    </div>
                  </div>
                ))}
                {previews.length > 50 && (
                  <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed pt-1 text-center text-xs">
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
            className="hover:bg-background-color-2 dark:hover:bg-dark-background-color-2 text-font-color-black dark:text-font-color-white cursor-pointer rounded-lg bg-transparent px-4 py-2 text-xs font-medium"
          />
          <Button
            label={`Replace (${previews.length} Changes)`}
            clickHandler={handleApply}
            isDisabled={previews.length === 0}
            className="bg-font-color-highlight dark:bg-dark-font-color-highlight cursor-pointer rounded-lg px-4 py-2 text-xs font-medium text-white disabled:opacity-40"
          />
        </div>
      </div>
    </div>
  );
});

export default FindReplaceModal;
