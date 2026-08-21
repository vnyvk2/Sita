import React, { memo, useMemo, useState } from 'react';
import Button from '../Button';
import type { EditableField } from './types';
import { formatStringList } from './utils';
import { previewCaseTransform } from './batchTransforms/caseTransform';
import type {
  BatchTransformContext,
  CaseConvertMode,
  CaseTransformConfig
} from './batchTransforms/types';

export interface CaseConvertModalProps {
  isOpen: boolean;
  context: BatchTransformContext;
  onApply: (config: CaseTransformConfig) => void;
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

const MODES: Array<{ mode: CaseConvertMode; label: string; description: string }> = [
  { mode: 'title', label: 'Title Case', description: 'Capitalizes principal words, preserving minor words (e.g. "The Dark Side of the Moon")' },
  { mode: 'sentence', label: 'Sentence case', description: 'Capitalizes only the first character of each entry' },
  { mode: 'upper', label: 'UPPERCASE', description: 'Converts all characters to uppercase' },
  { mode: 'lower', label: 'lowercase', description: 'Converts all characters to lowercase' }
];

export const CaseConvertModal = memo(function CaseConvertModal({
  isOpen,
  context,
  onApply,
  onClose
}: CaseConvertModalProps) {
  const [mode, setMode] = useState<CaseConvertMode>('title');
  const [targetFields, setTargetFields] = useState<EditableField[]>(['title', 'artists', 'album']);

  const previews = useMemo(() => {
    if (targetFields.length === 0) return [];

    return previewCaseTransform(context, {
      mode,
      targetFields,
      allowAllWhenNoneSelected: false
    });
  }, [context, mode, targetFields]);

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
    if (targetFields.length === 0 || previews.length === 0) return;

    onApply({
      mode,
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
      <div className="w-full max-w-xl rounded-2xl bg-background-color-1 p-6 shadow-2xl dark:bg-dark-background-color-1 border border-background-color-2 dark:border-dark-background-color-2">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-font-color-black dark:text-font-color-white">
              Case Converter
            </h2>
            <p className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed">
              Transform casing of metadata fields across selected tracks.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-font-color-dimmed hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:text-font-color-white cursor-pointer"
          >
            <span className="material-icons-round">close</span>
          </button>
        </div>

        {/* Mode Selector */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              onClick={() => setMode(m.mode)}
              className={`rounded-xl border p-2.5 text-left transition cursor-pointer ${
                mode === m.mode
                  ? 'border-font-color-highlight bg-font-color-highlight/10 dark:border-dark-font-color-highlight dark:bg-dark-font-color-highlight/10'
                  : 'border-background-color-2 bg-background-color-2/20 hover:bg-background-color-2/40 dark:border-dark-background-color-2 dark:bg-dark-background-color-2/20 dark:hover:bg-dark-background-color-2/40'
              }`}
            >
              <p className="text-xs font-semibold text-font-color-black dark:text-font-color-white">
                {m.label}
              </p>
              <p className="text-[11px] text-font-color-dimmed dark:text-dark-font-color-dimmed mt-0.5 truncate">
                {m.description}
              </p>
            </button>
          ))}
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

        {/* Live Preview */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-font-color-black dark:text-font-color-white">
              Preview Matches ({affectedTracksCount} tracks affected &middot; {previews.length} fields will change)
            </span>
          </div>

          <div className="max-h-44 overflow-y-auto rounded-xl border border-background-color-2 bg-background-color-2/10 p-2 text-xs dark:border-dark-background-color-2 dark:bg-dark-background-color-2/10">
            {previews.length === 0 ? (
              <p className="text-center py-6 text-font-color-dimmed dark:text-dark-font-color-dimmed italic">
                All selected fields already match the chosen case format.
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
                      <span className="text-font-color-dimmed line-through truncate max-w-[180px]">
                        {formatDisplay(p.before)}
                      </span>
                      <span className="material-icons-round text-xs text-font-color-dimmed">arrow_forward</span>
                      <span className="text-emerald-400 font-medium truncate max-w-[180px]">
                        {formatDisplay(p.after)}
                      </span>
                    </div>
                  </div>
                ))}
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
            label={`Apply (${previews.length} Changes)`}
            clickHandler={handleApply}
            isDisabled={previews.length === 0}
            className="bg-font-color-highlight dark:bg-dark-font-color-highlight text-white text-xs px-4 py-2 rounded-lg font-medium cursor-pointer disabled:opacity-40"
          />
        </div>
      </div>
    </div>
  );
});

export default CaseConvertModal;
