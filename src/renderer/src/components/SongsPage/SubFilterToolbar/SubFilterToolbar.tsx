import { memo, useCallback, useEffect, useRef, useState, type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@tanstack/react-store';

import Button from '@renderer/components/Button';
import Dropdown, { type DropdownOption } from '@renderer/components/Dropdown';
import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import {
  SUB_FILTER_TOOLS,
  getValidPinnedTools,
  type SubFilterContext,
  type SubFilterToolId,
  type ToolRenderProps
} from './subFilterRegistry';

export interface SubFilterToolbarProps extends ToolRenderProps {
  context: SubFilterContext;
  hasActiveSubFilters?: boolean;
  onClearSubFilters?: () => void;
  className?: string;
}

export const SubFilterToolbar: FC<SubFilterToolbarProps> = memo((props) => {
  const {
    context,
    isCompact,
    onToggleCompact,
    language = 'all',
    languageOptions = [],
    onLanguageChange,
    genre = 'all',
    genreOptions = [],
    onGenreChange,
    onlyFavoriteArtists = false,
    onToggleFavoriteArtists,
    onlyFavoriteAlbums = false,
    onToggleFavoriteAlbums,
    onClearDuplicates,
    isLibraryEmpty = false,
    hasActiveSubFilters = false,
    onClearSubFilters,
    className = ''
  } = props;

  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  const storedPinned = useStore(
    store,
    (state) => state.localStorage.preferences.pinnedSubFilterTools
  );

  const pinnedTools = getValidPinnedTools(context, storedPinned);

  const togglePin = useCallback(
    (id: SubFilterToolId, e?: React.MouseEvent) => {
      e?.stopPropagation();
      const current = new Set(pinnedTools);
      if (current.has(id)) {
        current.delete(id);
      } else {
        current.add(id);
      }
      const nextList = Array.from(current);
      storage.preferences.setPreferences('pinnedSubFilterTools', nextList);
    },
    [pinnedTools]
  );

  // Close menu on outside click or Escape key
  useEffect(() => {
    if (!isMenuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  const availableTools = SUB_FILTER_TOOLS.filter((tool) => tool.contexts.includes(context));

  // Render individual pinned tool pill
  const renderToolPill = (id: SubFilterToolId): ReactNode => {
    switch (id) {
      case 'compactView':
        return (
          <Button
            key="compact-view-pill"
            className={`compact-view-pill rounded-3xl px-3 py-1 text-xs md:text-sm transition-colors cursor-pointer shrink-0 ${
              isCompact
                ? 'bg-accent text-font-color-white font-medium shadow-xs'
                : 'bg-background-color-2/50 dark:bg-dark-background-color-2/50 hover:bg-background-color-3 dark:hover:bg-dark-background-color-3'
            }`}
            iconName="table_rows"
            label={t('common.compactView', 'Compact View')}
            clickHandler={onToggleCompact}
          />
        );
      case 'language':
        if (!onLanguageChange || languageOptions.length === 0) return null;
        return (
          <div key="language-pill" className="shrink-0">
            <Dropdown
              name="songsPageLanguageDropdown"
              type={`${t('common.language', 'Language')} :`}
              value={language}
              options={languageOptions as DropdownOption<string>[]}
              onChange={(e) => onLanguageChange(e.currentTarget.value)}
            />
          </div>
        );
      case 'genre':
        if (!onGenreChange || genreOptions.length === 0) return null;
        return (
          <div key="genre-pill" className="shrink-0">
            <Dropdown
              name="songsPageGenreDropdown"
              type={`${t('common.genre', 'Genre')} :`}
              value={genre}
              options={genreOptions as DropdownOption<string>[]}
              onChange={(e) => onGenreChange(e.currentTarget.value)}
            />
          </div>
        );
      case 'favoriteArtists':
        if (!onToggleFavoriteArtists) return null;
        return (
          <Button
            key="fav-artists-filter-btn"
            className={`fav-artists-filter-btn rounded-3xl px-3 py-1 text-xs md:text-sm shrink-0 cursor-pointer ${
              onlyFavoriteArtists
                ? 'bg-background-color-3 dark:bg-dark-background-color-3 text-font-color-black!'
                : 'bg-background-color-2/50 dark:bg-dark-background-color-2/50 hover:bg-background-color-3 dark:hover:bg-dark-background-color-3'
            }`}
            iconName={onlyFavoriteArtists ? 'star' : 'star_outline'}
            label={t('common.favoriteArtists', 'Favorite Artists')}
            clickHandler={onToggleFavoriteArtists}
          />
        );
      case 'favoriteAlbums':
        if (!onToggleFavoriteAlbums) return null;
        return (
          <Button
            key="fav-albums-filter-btn"
            className={`fav-albums-filter-btn rounded-3xl px-3 py-1 text-xs md:text-sm shrink-0 cursor-pointer ${
              onlyFavoriteAlbums
                ? 'bg-background-color-3 dark:bg-dark-background-color-3 text-font-color-black!'
                : 'bg-background-color-2/50 dark:bg-dark-background-color-2/50 hover:bg-background-color-3 dark:hover:bg-dark-background-color-3'
            }`}
            iconName="album"
            label={t('common.favoriteAlbums', 'Favorite Albums')}
            clickHandler={onToggleFavoriteAlbums}
          />
        );
      case 'clearDuplicates':
        if (!onClearDuplicates || isLibraryEmpty) return null;
        return (
          <Button
            key="clear-duplicates-btn"
            className="clear-duplicates-btn bg-background-color-2/50 dark:bg-dark-background-color-2/50 hover:bg-background-color-3 dark:hover:bg-dark-background-color-3 rounded-3xl px-3 py-1 text-xs md:text-sm shrink-0 cursor-pointer"
            iconName="cleaning_services"
            label={t('duplicateSongsPrompt.openButton', 'Clear Duplicates')}
            clickHandler={onClearDuplicates}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div
      className={`sub-filters-container relative mb-3 flex items-center gap-2 pr-4 text-xs md:text-sm flex-nowrap overflow-hidden ${className}`}
    >
      {/* Pinned pills rendered directly in the bar */}
      <div className="flex items-center gap-2 overflow-x-hidden flex-nowrap shrink min-w-0">
        {pinnedTools.map((toolId) => renderToolPill(toolId))}
      </div>

      {/* Clear active sub-filters chip */}
      {hasActiveSubFilters && onClearSubFilters && (
        <Button
          key="clear-sub-filters-btn"
          className="clear-sub-filters-btn text-xs opacity-75 hover:opacity-100 shrink-0 cursor-pointer"
          iconName="filter_alt_off"
          tooltipLabel={t('common.clearFilters', 'Clear sub-filters')}
          clickHandler={onClearSubFilters}
        />
      )}

      {/* 3-dots more tools menu */}
      <div className="relative shrink-0 ml-auto" ref={menuContainerRef}>
        <Button
          key="sub-filters-more-btn"
          className={`sub-filters-more-btn p-1.5 rounded-full transition-colors cursor-pointer ${
            isMenuOpen
              ? 'bg-background-color-3 dark:bg-dark-background-color-3 text-accent'
              : 'text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white hover:bg-background-color-2 dark:hover:bg-dark-background-color-2'
          }`}
          iconName="more_vert"
          tooltipLabel={t('common.moreTools', 'More tools & customize')}
          clickHandler={() => setIsMenuOpen((prev) => !prev)}
        />

        {isMenuOpen && (
          <div className="absolute right-0 top-full mt-1.5 z-50 min-w-64 rounded-xl border border-background-color-2 bg-background-color-1 p-2 shadow-xl dark:border-dark-background-color-2 dark:bg-dark-background-color-1">
            <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-font-color-dimmed opacity-70">
              {t('common.toolbarTools', 'Toolbar Tools & Pins')}
            </div>

            <div className="flex flex-col gap-0.5">
              {availableTools.map((tool) => {
                const isPinned = pinnedTools.includes(tool.id);

                return (
                  <div
                    key={tool.id}
                    className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-font-color-black transition-colors hover:bg-background-color-2/60 dark:text-font-color-white dark:hover:bg-dark-background-color-2/50"
                  >
                    <button
                      type="button"
                      className="flex flex-1 items-center gap-2 text-left cursor-pointer outline-none"
                      onClick={() => {
                        if (tool.id === 'compactView') {
                          onToggleCompact();
                        } else if (tool.id === 'favoriteArtists' && onToggleFavoriteArtists) {
                          onToggleFavoriteArtists();
                        } else if (tool.id === 'favoriteAlbums' && onToggleFavoriteAlbums) {
                          onToggleFavoriteAlbums();
                        } else if (tool.id === 'clearDuplicates' && onClearDuplicates) {
                          onClearDuplicates();
                          setIsMenuOpen(false);
                        }
                      }}
                    >
                      <span className="material-icons-round text-base opacity-75">{tool.icon}</span>
                      <span className="font-medium">{t(tool.labelKey, tool.defaultLabel)}</span>
                      {tool.id === 'compactView' && isCompact && (
                        <span className="ml-1 text-[10px] font-semibold text-accent">(Active)</span>
                      )}
                      {tool.id === 'favoriteArtists' && onlyFavoriteArtists && (
                        <span className="ml-1 text-[10px] font-semibold text-accent">(Active)</span>
                      )}
                      {tool.id === 'favoriteAlbums' && onlyFavoriteAlbums && (
                        <span className="ml-1 text-[10px] font-semibold text-accent">(Active)</span>
                      )}
                    </button>

                    {/* Pin / Unpin button */}
                    <button
                      type="button"
                      title={isPinned ? t('common.unpin', 'Unpin from toolbar') : t('common.pin', 'Pin to toolbar')}
                      className={`ml-2 p-1 rounded-md transition-colors cursor-pointer ${
                        isPinned
                          ? 'text-accent hover:bg-accent/10'
                          : 'text-font-color-dimmed opacity-40 hover:opacity-100 hover:bg-background-color-2 dark:hover:bg-dark-background-color-2'
                      }`}
                      onClick={(e) => togglePin(tool.id, e)}
                    >
                      <span className="material-icons-round text-base">
                        {isPinned ? 'push_pin' : 'push_pin'}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

SubFilterToolbar.displayName = 'SubFilterToolbar';
