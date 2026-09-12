import { KNOWN_LANGUAGES, normalizeLanguageName } from '@common/languages';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

export interface LanguageComboboxProps {
  value?: string;
  onChange: (value: string) => void;
  onSelect?: (value: string) => void;
  placeholder?: string;
  focusOnMount?: boolean;
  className?: string;
  disabled?: boolean;
  onBlur?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}

export const LanguageCombobox = memo(function LanguageCombobox({
  value = '',
  onChange,
  onSelect,
  placeholder = 'Select or type language...',
  focusOnMount = false,
  className = '',
  disabled = false,
  onBlur,
  onKeyDown
}: LanguageComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Sync internal searchTerm with external value prop
  useEffect(() => {
    setSearchTerm(value);
  }, [value]);

  useEffect(() => {
    if (focusOnMount && inputRef.current) {
      inputRef.current.focus();
    }
  }, [focusOnMount]);

  const filteredLanguages = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return KNOWN_LANGUAGES;
    return KNOWN_LANGUAGES.filter((lang) => lang.toLowerCase().includes(term));
  }, [searchTerm]);

  const hasExactMatch = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return KNOWN_LANGUAGES.some((lang) => lang.toLowerCase() === term);
  }, [searchTerm]);

  const handleSelect = useCallback(
    (lang: string) => {
      const normalized = normalizeLanguageName(lang);
      setSearchTerm(normalized);
      onChange(normalized);
      onSelect?.(normalized);
      setIsOpen(false);
      setHighlightedIndex(-1);
    },
    [onChange, onSelect]
  );

  const handleClear = useCallback(() => {
    setSearchTerm('');
    onChange('');
    onSelect?.('');
    setIsOpen(false);
    setHighlightedIndex(-1);
  }, [onChange, onSelect]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((prev) => (prev < filteredLanguages.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredLanguages.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen && highlightedIndex >= 0 && filteredLanguages[highlightedIndex]) {
        handleSelect(filteredLanguages[highlightedIndex]);
      } else if (searchTerm.trim()) {
        handleSelect(searchTerm);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setSearchTerm(value);
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            const next = e.target.value;
            setSearchTerm(next);
            onChange(next);
            setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onBlur={onBlur}
          onKeyDown={handleKeyDown}
          className="border-background-color-2 bg-background-color-1 text-font-color-black focus:border-font-color-highlight dark:border-dark-background-color-2 dark:bg-dark-background-color-1 dark:text-font-color-white dark:focus:border-dark-font-color-highlight w-full rounded-lg border px-3 py-1.5 pr-14 text-xs focus:outline-none"
        />

        <div className="absolute right-1.5 flex items-center gap-1">
          {searchTerm && (
            <button
              type="button"
              tabIndex={-1}
              onClick={handleClear}
              className="text-font-color-dimmed hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:text-font-color-white flex h-5 w-5 items-center justify-center rounded text-xs transition"
              title="Clear language"
            >
              <span className="material-icons-round text-sm">close</span>
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setIsOpen((prev) => !prev)}
            className="text-font-color-dimmed hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:text-font-color-white flex h-5 w-5 items-center justify-center rounded transition"
          >
            <span className="material-icons-round text-sm">
              {isOpen ? 'arrow_drop_up' : 'arrow_drop_down'}
            </span>
          </button>
        </div>
      </div>

      {isOpen && (
        <ul
          ref={listRef}
          className="bg-background-color-1 dark:bg-dark-background-color-1 border-background-color-2 dark:border-dark-background-color-2 absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border py-1 text-xs shadow-xl"
        >
          {filteredLanguages.map((lang, index) => {
            const isSelected = value.toLowerCase() === lang.toLowerCase();
            const isHighlighted = highlightedIndex === index;

            return (
              <li
                key={lang}
                onMouseDown={(e) => {
                  e.preventDefault(); // prevent blur before select
                  handleSelect(lang);
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`flex cursor-pointer items-center justify-between px-3 py-1.5 transition ${
                  isHighlighted
                    ? 'bg-font-color-highlight/10 text-font-color-highlight dark:bg-dark-font-color-highlight/20 dark:text-dark-font-color-highlight'
                    : 'text-font-color-black dark:text-font-color-white hover:bg-neutral-800/20 dark:hover:bg-neutral-800/60'
                }`}
              >
                <span>{lang}</span>
                {isSelected && (
                  <span className="material-icons-round text-font-color-highlight dark:text-dark-font-color-highlight text-xs">
                    check
                  </span>
                )}
              </li>
            );
          })}

          {searchTerm.trim() && !hasExactMatch && (
            <li
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(searchTerm);
              }}
              className="border-background-color-2 dark:border-dark-background-color-2 text-font-color-highlight dark:text-dark-font-color-highlight flex cursor-pointer items-center gap-1.5 border-t px-3 py-1.5 font-medium hover:bg-neutral-800/30"
            >
              <span className="material-icons-round text-xs">add</span>
              <span>Use custom: &quot;{normalizeLanguageName(searchTerm)}&quot;</span>
            </li>
          )}

          {filteredLanguages.length === 0 && !searchTerm.trim() && (
            <li className="text-font-color-dimmed dark:text-dark-font-color-dimmed px-3 py-2 text-center">
              No languages found
            </li>
          )}
        </ul>
      )}
    </div>
  );
});

export default LanguageCombobox;
