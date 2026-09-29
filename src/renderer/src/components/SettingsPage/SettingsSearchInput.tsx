/* eslint-disable jsx-a11y/no-redundant-roles, jsx-a11y/click-events-have-key-events */
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import HighlightedText from '../SearchPage/HighlightedText';
import { getSectionDisplayName, settingsCatalog } from './settingsCatalog';
import { useSettingsCollapse, useSettingsCollapseActions } from './Settings/SettingsCollapseContext';
import { matchSettings, type SettingSearchResult } from './utils/matchSettings';

interface SettingsSearchInputProps {
  className?: string;
}

export const SettingsSearchInput = memo(({ className = '' }: SettingsSearchInputProps) => {
  const { t } = useTranslation();
  const collapseActions = useSettingsCollapseActions();
  const collapseContext = useSettingsCollapse();
  const jumpToSetting = collapseActions?.jumpToSetting ?? collapseContext?.jumpToSetting;

  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  const listboxId = useId();

  // Search matching
  const results = useMemo(() => {
    return matchSettings(query, settingsCatalog, t);
  }, [query, t]);

  const hasResults = results.length > 0;
  const showDropdown = isOpen && query.trim().length > 0;

  // Reset or clamp active index when results change
  useEffect(() => {
    if (!hasResults) {
      setActiveIndex(-1);
    } else {
      setActiveIndex((prev) => (prev >= 0 && prev < results.length ? prev : 0));
    }
  }, [hasResults, results.length, query]);

  // Jump to selected setting
  const handleSelectResult = useCallback(
    (result: SettingSearchResult) => {
      if (jumpToSetting) {
        jumpToSetting(result.entry.id, result.entry.sectionKey);
      }
      setIsOpen(false);
      inputRef.current?.blur();
    },
    [jumpToSetting]
  );

  // Keyboard navigation inside input / combobox
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showDropdown) {
        if (e.key === 'ArrowDown' && query.trim().length > 0) {
          e.preventDefault();
          setIsOpen(true);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < results.length) {
            handleSelectResult(results[activeIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          if (isOpen) {
            setIsOpen(false);
          } else if (query) {
            setQuery('');
          } else {
            inputRef.current?.blur();
          }
          break;
        case 'Tab':
          setIsOpen(false);
          break;
      }
    },
    [showDropdown, query, results, activeIndex, isOpen, handleSelectResult]
  );

  // Scroll active list item into view when navigating via arrow keys
  useEffect(() => {
    if (activeIndex >= 0 && listboxRef.current) {
      const activeElement = listboxRef.current.children[activeIndex] as HTMLElement | undefined;
      activeElement?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [activeIndex]);

  // Click outside listener to dismiss dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Global keybindings: Ctrl+F / Cmd+F to focus search, / to quick search
  useEffect(() => {
    const isInteractiveElement = (el: Element | null): boolean => {
      if (!el) return false;
      const tagName = el.tagName;
      return (
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT' ||
        tagName === 'BUTTON' ||
        (el as HTMLElement).isContentEditable ||
        Boolean(el.closest('[role="dialog"]'))
      );
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isCtrlF = (e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F');
      if (isCtrlF) {
        const activeEl = document.activeElement;
        const isOtherInputFocused =
          activeEl !== inputRef.current &&
          (activeEl?.tagName === 'INPUT' ||
            activeEl?.tagName === 'TEXTAREA' ||
            (activeEl as HTMLElement)?.isContentEditable);

        if (!isOtherInputFocused) {
          e.preventDefault();
          inputRef.current?.focus();
          inputRef.current?.select();
          setIsOpen(true);
          return;
        }
      }

      if (e.key === '/' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        if (!isInteractiveElement(document.activeElement)) {
          e.preventDefault();
          inputRef.current?.focus();
          setIsOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const activeOptionId =
    showDropdown && activeIndex >= 0 && results[activeIndex]
      ? `settings-search-opt-${results[activeIndex].entry.id}`
      : undefined;

  return (
    <div ref={containerRef} className={`relative flex items-center ${className}`}>
      {/* Accessible Combobox Input */}
      <div className="relative flex items-center">
        <span className="material-icons-round text-font-color-dim dark:text-dark-font-color-dim pointer-events-none absolute left-3 text-lg">
          search
        </span>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          placeholder={t('settingsPage.searchSettings', 'Search settings... (Ctrl+F or /)')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (query.trim().length > 0) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          className="border-background-color-2 focus:border-font-color-highlight dark:border-dark-background-color-2 dark:focus:border-dark-font-color-highlight w-64 rounded-full border-[1.5px] bg-transparent py-1.5 pr-8 pl-9 text-sm outline-none sm:w-80 md:w-96 md:text-base"
        />

        {query.length > 0 && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery('');
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className="text-font-color-dim dark:text-dark-font-color-dim hover:text-font-color-highlight dark:hover:text-dark-font-color-highlight absolute right-2.5 flex cursor-pointer items-center justify-center text-sm"
          >
            <span className="material-icons-round text-base">close</span>
          </button>
        )}
      </div>

      {/* Screen reader live region */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {showDropdown &&
          (hasResults
            ? t('settingsPage.resultsCount', '{{count}} settings found', { count: results.length })
            : t('settingsPage.noMatchingSettings', 'No settings found matching "{{query}}"', {
                query
              }))}
      </div>

      {/* Dropdown Results Listbox */}
      {showDropdown && (
        <div className="bg-background-color-1 dark:bg-dark-background-color-1 border-background-color-2 dark:border-dark-background-color-2 animate-in fade-in slide-in-from-top-2 absolute top-full right-0 z-50 mt-2 max-h-96 w-96 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border shadow-xl [scrollbar-gutter:stable]">
          {hasResults ? (
            <ul
              ref={listboxRef}
              id={listboxId}
              role="listbox"
              tabIndex={-1}
              aria-label={t('settingsPage.searchResults', 'Settings search results')}
              className="p-1.5"
            >
              {results.map((result, index) => {
                const isSelected = index === activeIndex;
                const sectionName = getSectionDisplayName(result.entry.sectionKey, t);

                return (
                  <li
                    key={result.entry.id}
                    id={`settings-search-opt-${result.entry.id}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectResult(result);
                    }}
                    onClick={() => handleSelectResult(result)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`group flex cursor-pointer flex-col rounded-lg px-3 py-2 text-left transition-colors ${
                      isSelected
                        ? 'bg-background-color-2 dark:bg-dark-background-color-2 text-font-color-highlight dark:text-dark-font-color-highlight'
                        : 'hover:bg-background-color-2/50 dark:hover:bg-dark-background-color-2/50'
                    }`}
                  >
                    {/* Header: Section badge & matched alias */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="bg-background-color-3 dark:bg-dark-background-color-3 text-font-color-dim dark:text-dark-font-color-dim rounded-md px-1.5 py-0.5 font-medium">
                        {sectionName}
                      </span>
                      {result.matchedField === 'alias' && result.matchedAlias && (
                        <span className="text-font-color-dim dark:text-dark-font-color-dim text-[11px] italic">
                          {t('settingsPage.aliasMatch', 'Keyword match: {{keyword}}', {
                            keyword: result.matchedAlias
                          })}
                        </span>
                      )}
                    </div>

                    {/* Setting Title */}
                    <span className="mt-1 font-medium leading-tight">
                      <HighlightedText text={result.title} highlight={result.highlightQuery} />
                    </span>

                    {/* Setting Description */}
                    {result.description && (
                      <span className="text-font-color-dim dark:text-dark-font-color-dim mt-0.5 line-clamp-1 text-xs leading-normal">
                        <HighlightedText
                          text={result.description}
                          highlight={result.highlightQuery}
                        />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="text-font-color-dim dark:text-dark-font-color-dim p-4 text-center text-sm">
              {t('settingsPage.noMatchingSettings', 'No settings found matching "{{query}}"', {
                query
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

SettingsSearchInput.displayName = 'SettingsSearchInput';
export default SettingsSearchInput;
