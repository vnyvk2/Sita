import React, { memo, useState } from 'react';
import Button from '../Button';
import type { EditableField } from './types';
import type { BulkFieldOperation } from './batchTransforms/types';

export interface BulkSetValuesModalProps {
  isOpen: boolean;
  selectedCount: number;
  onApply: (operations: BulkFieldOperation[]) => void;
  onClose: () => void;
}

interface FieldConfig {
  field: EditableField;
  label: string;
  type: 'text' | 'number';
  placeholder: string;
}

const FIELDS: FieldConfig[] = [
  { field: 'artists', label: 'Artist(s)', type: 'text', placeholder: 'e.g. Queen, David Bowie' },
  { field: 'album', label: 'Album', type: 'text', placeholder: 'e.g. Greatest Hits' },
  { field: 'albumArtists', label: 'Album Artist(s)', type: 'text', placeholder: 'e.g. Queen' },
  { field: 'genres', label: 'Genre(s)', type: 'text', placeholder: 'e.g. Rock, Classic Rock' },
  { field: 'year', label: 'Year', type: 'number', placeholder: 'e.g. 2024' },
  { field: 'discNumber', label: 'Disc #', type: 'number', placeholder: 'e.g. 1' },
  { field: 'composer', label: 'Composer', type: 'text', placeholder: 'e.g. Freddie Mercury' }
];

export const BulkSetValuesModal = memo(function BulkSetValuesModal({
  isOpen,
  selectedCount,
  onApply,
  onClose
}: BulkSetValuesModalProps) {
  const [activeFields, setActiveFields] = useState<Record<EditableField, boolean>>({
    title: false,
    artists: false,
    albumArtists: false,
    album: false,
    genres: false,
    trackNumber: false,
    discNumber: false,
    year: false,
    composer: false
  });

  const [values, setValues] = useState<Record<EditableField, string>>({
    title: '',
    artists: '',
    albumArtists: '',
    album: '',
    genres: '',
    trackNumber: '',
    discNumber: '',
    year: '',
    composer: ''
  });

  const [clearFlags, setClearFlags] = useState<Record<EditableField, boolean>>({
    title: false,
    artists: false,
    albumArtists: false,
    album: false,
    genres: false,
    trackNumber: false,
    discNumber: false,
    year: false,
    composer: false
  });

  if (!isOpen) return null;

  const enabledFieldCount = Object.values(activeFields).filter(Boolean).length;

  const handleApply = () => {
    const operations: BulkFieldOperation[] = [];

    for (const { field } of FIELDS) {
      if (activeFields[field]) {
        if (clearFlags[field]) {
          operations.push({ type: 'clear', field });
        } else {
          operations.push({ type: 'set', field, value: values[field] });
        }
      }
    }

    if (operations.length > 0) {
      onApply(operations);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-background-color-1 p-6 shadow-2xl dark:bg-dark-background-color-1 border border-background-color-2 dark:border-dark-background-color-2">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-font-color-black dark:text-font-color-white">
              Set Values Across Selection
            </h2>
            <p className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed">
              Apply common metadata values to {selectedCount} selected tracks.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-font-color-dimmed hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:text-font-color-white cursor-pointer"
          >
            <span className="material-icons-round">close</span>
          </button>
        </div>

        {/* Fields list */}
        <div className="max-h-96 overflow-y-auto space-y-3 pr-1 py-1">
          {FIELDS.map(({ field, label, type, placeholder }) => {
            const isEnabled = activeFields[field];
            const isClear = clearFlags[field];

            return (
              <div
                key={field}
                className={`rounded-xl border p-3 transition ${
                  isEnabled
                    ? 'border-font-color-highlight/40 bg-font-color-highlight/5 dark:border-dark-font-color-highlight/40 dark:bg-dark-font-color-highlight/5'
                    : 'border-background-color-2/60 bg-background-color-2/20 dark:border-dark-background-color-2/60 dark:bg-dark-background-color-2/20'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-font-color-black dark:text-font-color-white">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={(e) => {
                        setActiveFields((prev) => ({ ...prev, [field]: e.target.checked }));
                      }}
                      className="cursor-pointer accent-font-color-highlight dark:accent-dark-font-color-highlight"
                    />
                    <span>{label}</span>
                  </label>

                  {isEnabled && (
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed">
                      <input
                        type="checkbox"
                        checked={isClear}
                        onChange={(e) => {
                          setClearFlags((prev) => ({ ...prev, [field]: e.target.checked }));
                        }}
                        className="cursor-pointer accent-red-500"
                      />
                      <span>Clear field</span>
                    </label>
                  )}
                </div>

                {isEnabled && !isClear && (
                  <div className="mt-2.5">
                    <input
                      type={type}
                      value={values[field]}
                      placeholder={placeholder}
                      onChange={(e) => {
                        setValues((prev) => ({ ...prev, [field]: e.target.value }));
                      }}
                      className="w-full rounded-lg border border-background-color-2 bg-background-color-1 px-3 py-1.5 text-xs text-font-color-black focus:border-font-color-highlight focus:outline-none dark:border-dark-background-color-2 dark:bg-dark-background-color-1 dark:text-font-color-white dark:focus:border-dark-font-color-highlight"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between">
          <span className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed">
            {enabledFieldCount} field{enabledFieldCount === 1 ? '' : 's'} selected
          </span>
          <div className="flex gap-2">
            <Button
              label="Cancel"
              clickHandler={onClose}
              className="bg-transparent hover:bg-background-color-2 dark:hover:bg-dark-background-color-2 text-font-color-black dark:text-font-color-white text-xs px-4 py-2 rounded-lg font-medium cursor-pointer"
            />
            <Button
              label={`Apply to ${selectedCount} Tracks`}
              clickHandler={handleApply}
              isDisabled={enabledFieldCount === 0}
              className="bg-font-color-highlight dark:bg-dark-font-color-highlight text-white text-xs px-4 py-2 rounded-lg font-medium cursor-pointer disabled:opacity-40"
            />
          </div>
        </div>
      </div>
    </div>
  );
});

export default BulkSetValuesModal;
