import { normalizeLanguageName } from '@common/languages';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';

import LanguageCombobox from './LanguageCombobox';
import type { EditableField } from './types';

export interface EditableCellProps {
  value: string | number | undefined;
  displayValue?: string;
  field: EditableField;
  isDirty?: boolean;
  errorMessage?: string;
  placeholder?: string;
  type?: 'text' | 'number' | 'language';
  onCommit: (field: EditableField, value: string | number | undefined) => void;
}

export const EditableCell = memo(function EditableCell({
  value,
  displayValue,
  field,
  isDirty = false,
  errorMessage,
  placeholder = '--',
  type = 'text',
  onCommit
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentInput, setCurrentInput] = useState<string>(
    value === undefined || value === null ? '' : String(value)
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setCurrentInput(value === undefined || value === null ? '' : String(value));
    }
  }, [value, isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current && type !== 'language') {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing, type]);

  const handleCommit = useCallback(() => {
    setIsEditing(false);
    const trimmed = currentInput.trim();
    if (trimmed === '') {
      onCommit(field, undefined);
      return;
    }

    if (type === 'language') {
      onCommit(field, normalizeLanguageName(trimmed));
    } else if (type === 'number') {
      const parsed = Number(trimmed);
      onCommit(field, isNaN(parsed) ? undefined : parsed);
    } else {
      onCommit(field, trimmed);
    }
  }, [currentInput, field, onCommit, type]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setCurrentInput(value === undefined || value === null ? '' : String(value));
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCommit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      } else if (e.key === 'Tab') {
        // Commit without preventDefault so focus naturally transitions to next interactive cell
        handleCommit();
      }
    },
    [handleCommit, handleCancel]
  );

  const shownText = displayValue !== undefined ? displayValue : (value ?? '');

  if (isEditing) {
    if (type === 'language') {
      return (
        <div className="relative flex h-full w-full items-center">
          <LanguageCombobox
            value={currentInput}
            placeholder={placeholder}
            focusOnMount
            onChange={(val) => {
              setCurrentInput(val);
            }}
            onSelect={(val) => {
              setCurrentInput(val);
              onCommit(field, val ? normalizeLanguageName(val) : undefined);
              setIsEditing(false);
            }}
            onBlur={handleCommit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
              }
            }}
          />
        </div>
      );
    }

    return (
      <div className="relative flex h-full w-full items-center">
        <input
          ref={inputRef}
          type={type === 'number' ? 'number' : 'text'}
          value={currentInput}
          onChange={(e) => setCurrentInput(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={handleKeyDown}
          className="border-font-color-highlight bg-background-color-1 text-font-color-black dark:border-dark-font-color-highlight dark:bg-dark-background-color-1 dark:text-font-color-white h-8 w-full rounded border px-2 text-xs outline-none"
          placeholder={placeholder}
        />
      </div>
    );
  }

  return (
    <div
      onDoubleClick={() => setIsEditing(true)}
      title={errorMessage || (shownText ? String(shownText) : undefined)}
      className={`group hover:bg-background-color-2/40 dark:hover:bg-dark-background-color-2/40 relative flex h-full min-h-[32px] w-full cursor-pointer items-center justify-between rounded px-2 py-1 transition-colors ${
        isDirty
          ? 'border-font-color-highlight dark:border-dark-font-color-highlight border-l-2 pl-1.5'
          : ''
      } ${errorMessage ? 'bg-red-500/10 text-red-500' : ''}`}
    >
      <span
        className={`truncate text-xs ${!shownText ? 'text-font-color-dimmed/60 dark:text-dark-font-color-dimmed/60 italic' : 'text-font-color-black dark:text-font-color-white'}`}
      >
        {shownText || placeholder}
      </span>
      {errorMessage && (
        <span className="material-icons-round ml-1 text-xs text-red-500" title={errorMessage}>
          error_outline
        </span>
      )}
    </div>
  );
});

export default EditableCell;
