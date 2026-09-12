import { memo, useMemo, useState } from 'react';

import Button from '../Button';
import { previewCaseTransform } from './batchTransforms/caseTransform';
import type {
  BatchTransformContext,
  CaseConvertMode,
  CaseTransformConfig
} from './batchTransforms/types';
import type { EditableField } from './types';
import { formatStringList } from './utils';

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
  {
    mode: 'title',
    label: 'Title Case',
    description:
      'Capitalizes principal words, preserving minor words (e.g. "The Dark Side of the Moon")'
  },
  {
    mode: 'sentence',
    label: 'Sentence case',
    description: 'Capitalizes only the first character of each entry'
  },
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="bg-background-color-1 dark:bg-dark-background-color-1 border-background-color-2 dark:border-dark-background-color-2 w-full max-w-xl rounded-2xl border p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-font-color-black dark:text-font-color-white text-lg font-semibold">
              Case Converter
            </h2>
            <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs">
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
        <div className="mb-4 grid grid-cols-2 gap-2">
          {MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              onClick={() => setMode(m.mode)}
              className={`cursor-pointer rounded-xl border p-2.5 text-left transition ${
                mode === m.mode
                  ? 'border-font-color-highlight bg-font-color-highlight/10 dark:border-dark-font-color-highlight dark:bg-dark-font-color-highlight/10'
                  : 'border-background-color-2 bg-background-color-2/20 hover:bg-background-color-2/40 dark:border-dark-background-color-2 dark:bg-dark-background-color-2/20 dark:hover:bg-dark-background-color-2/40'
              }`}
            >
              <p className="text-font-color-black dark:text-font-color-white text-xs font-semibold">
                {m.label}
              </p>
              <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed mt-0.5 truncate text-[11px]">
                {m.description}
              </p>
            </button>
          ))}
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

        {/* Live Preview */}
        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-font-color-black dark:text-font-color-white text-xs font-semibold">
              Preview Matches ({affectedTracksCount} tracks affected &middot; {previews.length}{' '}
              fields will change)
            </span>
          </div>

          <div className="border-background-color-2 bg-background-color-2/10 dark:border-dark-background-color-2 dark:bg-dark-background-color-2/10 max-h-44 overflow-y-auto rounded-xl border p-2 text-xs">
            {previews.length === 0 ? (
              <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed py-6 text-center italic">
                All selected fields already match the chosen case format.
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
                      <span className="text-font-color-dimmed max-w-[180px] truncate line-through">
                        {formatDisplay(p.before)}
                      </span>
                      <span className="material-icons-round text-font-color-dimmed text-xs">
                        arrow_forward
                      </span>
                      <span className="max-w-[180px] truncate font-medium text-emerald-400">
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
            className="hover:bg-background-color-2 dark:hover:bg-dark-background-color-2 text-font-color-black dark:text-font-color-white cursor-pointer rounded-lg bg-transparent px-4 py-2 text-xs font-medium"
          />
          <Button
            label={`Apply (${previews.length} Changes)`}
            clickHandler={handleApply}
            isDisabled={previews.length === 0}
            className="bg-font-color-highlight dark:bg-dark-font-color-highlight cursor-pointer rounded-lg px-4 py-2 text-xs font-medium text-white disabled:opacity-40"
          />
        </div>
      </div>
    </div>
  );
});

export default CaseConvertModal;
