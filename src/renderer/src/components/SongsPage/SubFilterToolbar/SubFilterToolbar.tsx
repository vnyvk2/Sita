import Button from '@renderer/components/Button';
import Dropdown, { type DropdownOption } from '@renderer/components/Dropdown';
import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { useStore } from '@tanstack/react-store';
import { memo, useCallback, useEffect, useRef, useState, type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

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

import type { SongViewMode } from '@renderer/utils/songViewMode';

export const SubFilterToolbar: FC<SubFilterToolbarProps> = memo((props) => {
  const {
    context,
    isCompact,
    onToggleCompact,
    songViewMode,
    onViewModeChange,
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
      const baseList = Array.isArray(storedPinned) ? storedPinned : pinnedTools;
      const current = new Set<SubFilterToolId>(baseList as SubFilterToolId[]);
      if (current.has(id)) {
        current.delete(id);
      } else {
        current.add(id);
      }
      const nextList = SUB_FILTER_TOOLS.map((t) => t.id).filter((toolId) => current.has(toolId));
      storage.preferences.setPreferences('pinnedSubFilterTools', nextList);
    },
    [storedPinned, pinnedTools]
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
      case 'compactView': {
        const currentMode: SongViewMode = songViewMode ?? (isCompact ? 'compact' : 'normal');
        const nextModeMap: Record<SongViewMode, SongViewMode> = {
          normal: 'small',
          small: 'compact',
          compact: 'normal'
        };
        const handlePillClick = () => {
          if (onViewModeChange) {
            onViewModeChange(nextModeMap[currentMode]);
          } else if (onToggleCompact) {
            onToggleCompact();
          }
        };

        const modeLabels: Record<SongViewMode, string> = {
          normal: 'Normal (60px)',
          small: 'Small (48px)',
          compact: 'Compact (38px)'
        };

        const modeIcons: Record<SongViewMode, string> = {
          normal: 'view_agenda',
          small: 'density_medium',
          compact: 'table_rows'
        };

        const tooltipLabel = onViewModeChange
          ? `${t('common.compactView', 'Compact View')} / ${t('common.viewMode', 'Density')}: ${modeLabels[currentMode]} (${t('common.clickToCycle', 'click to cycle')})`
          : t('common.compactView', 'Compact View');

        return (
          <Button
            key="compact-view-pill"
            className={`compact-view-pill mr-0! shrink-0 cursor-pointer rounded-3xl px-2.5 py-1 text-xs transition-colors md:text-sm ${
              currentMode !== 'normal'
                ? 'bg-accent text-font-color-white font-medium shadow-xs'
                : 'bg-background-color-2/50 dark:bg-dark-background-color-2/50 hover:bg-background-color-3 dark:hover:bg-dark-background-color-3'
            }`}
            iconName={modeIcons[currentMode]}
            tooltipLabel={tooltipLabel}
            clickHandler={handlePillClick}
          />
        );
      }
      case 'language':
        if (!onLanguageChange || languageOptions.length === 0) return null;
        return (
          <div key="language-pill" className="shrink-0">
            <Dropdown
              name="songsPageLanguageDropdown"
              className="ml-0!"
              triggerClassName="h-auto py-1 px-3 w-auto min-w-[6.5rem] max-w-[12rem] rounded-3xl border-0 bg-background-color-2/50 dark:bg-dark-background-color-2/50 hover:bg-background-color-3 dark:hover:bg-dark-background-color-3 text-xs md:text-sm font-normal"
              type={`${t('common.language', 'Language')} :`}
              showTypeInTrigger={false}
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
              className="ml-0!"
              triggerClassName="h-auto py-1 px-3 w-auto min-w-[6.5rem] max-w-[12rem] rounded-3xl border-0 bg-background-color-2/50 dark:bg-dark-background-color-2/50 hover:bg-background-color-3 dark:hover:bg-dark-background-color-3 text-xs md:text-sm font-normal"
              type={`${t('common.genre', 'Genre')} :`}
              showTypeInTrigger={false}
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
            className={`fav-artists-filter-btn mr-0! shrink-0 cursor-pointer rounded-3xl px-3 py-1 text-xs md:text-sm ${
              onlyFavoriteArtists
                ? 'bg-background-color-3 dark:bg-dark-background-color-3 text-font-color-black!'
                : 'bg-background-color-2/50 dark:bg-dark-background-color-2/50 hover:bg-background-color-3 dark:hover:bg-dark-background-color-3'
            }`}
            iconName={onlyFavoriteArtists ? 'star' : 'star_outline'}
            label={t('common.favArtists', 'Fav Artists')}
            tooltipLabel={t('common.favArtists', 'Fav Artists')}
            clickHandler={onToggleFavoriteArtists}
          />
        );
      case 'favoriteAlbums':
        if (!onToggleFavoriteAlbums) return null;
        return (
          <Button
            key="fav-albums-filter-btn"
            className={`fav-albums-filter-btn mr-0! shrink-0 cursor-pointer rounded-3xl px-3 py-1 text-xs md:text-sm ${
              onlyFavoriteAlbums
                ? 'bg-background-color-3 dark:bg-dark-background-color-3 text-font-color-black!'
                : 'bg-background-color-2/50 dark:bg-dark-background-color-2/50 hover:bg-background-color-3 dark:hover:bg-dark-background-color-3'
            }`}
            iconName="album"
            label={t('common.favAlbums', 'Fav Albums')}
            tooltipLabel={t('common.favAlbums', 'Fav Albums')}
            clickHandler={onToggleFavoriteAlbums}
          />
        );
      case 'clearDuplicates':
        if (!onClearDuplicates || isLibraryEmpty) return null;
        return (
          <Button
            key="clear-duplicates-btn"
            className="clear-duplicates-btn mr-0! bg-background-color-2/50 dark:bg-dark-background-color-2/50 hover:bg-background-color-3 dark:hover:bg-dark-background-color-3 shrink-0 cursor-pointer rounded-3xl px-3 py-1 text-xs md:text-sm"
            iconName="cleaning_services"
            label={t('duplicateSongsPrompt.openButtonShort', 'Clear Dups')}
            tooltipLabel={t('duplicateSongsPrompt.openButtonShort', 'Clear Dups')}
            clickHandler={onClearDuplicates}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div
      className={`sub-filters-container relative z-20 mb-3 flex flex-wrap items-center gap-2 overflow-visible pr-4 text-xs md:text-sm ${className}`}
    >
      {/* Pinned pills rendered directly in the bar */}
      <div className="flex min-w-0 shrink flex-wrap items-center gap-2 overflow-visible">
        {pinnedTools.map((toolId) => renderToolPill(toolId))}
      </div>

      {/* Clear active sub-filters chip */}
      {hasActiveSubFilters && onClearSubFilters && (
        <Button
          key="clear-sub-filters-btn"
          className="clear-sub-filters-btn shrink-0 cursor-pointer text-xs opacity-75 hover:opacity-100"
          iconName="filter_alt_off"
          tooltipLabel={t('common.clearFilters', 'Clear sub-filters')}
          clickHandler={onClearSubFilters}
        />
      )}

      {/* 3-dots more tools menu */}
      <div className="relative ml-auto shrink-0" ref={menuContainerRef}>
        <Button
          key="sub-filters-more-btn"
          className={`sub-filters-more-btn mr-0! cursor-pointer rounded-full border-0! p-1.5 transition-colors ${
            isMenuOpen
              ? 'bg-background-color-3 dark:bg-dark-background-color-3 text-accent'
              : 'text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white hover:bg-background-color-2 dark:hover:bg-dark-background-color-2'
          }`}
          iconName="more_vert"
          tooltipLabel={isMenuOpen ? undefined : t('common.moreTools', 'More tools & customize')}
          clickHandler={() => setIsMenuOpen((prev) => !prev)}
        />

        {isMenuOpen && (
          <div className="border-background-color-2 bg-background-color-1 dark:border-dark-background-color-2 dark:bg-dark-background-color-1 absolute top-full right-0 z-50 mt-1.5 min-w-64 rounded-xl border p-2 shadow-xl">
            <div className="text-font-color-dimmed mb-2 px-2 text-[10px] font-semibold tracking-wider uppercase opacity-70">
              {t('common.toolbarTools', 'Toolbar Tools & Pins')}
            </div>

            <div className="flex flex-col gap-0.5">
              {availableTools.map((tool) => {
                const isPinned = pinnedTools.includes(tool.id);

                return (
                  <div
                    key={tool.id}
                    className="text-font-color-black hover:bg-background-color-2/60 dark:text-font-color-white dark:hover:bg-dark-background-color-2/50 flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors"
                  >
                    <button
                      type="button"
                      className="flex flex-1 cursor-pointer items-center gap-2 text-left outline-none"
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
                        } else if (tool.id === 'language' || tool.id === 'genre') {
                          if (!isPinned) {
                            togglePin(tool.id);
                          }
                        }
                      }}
                    >
                      <span className="material-icons-round text-base opacity-75">{tool.icon}</span>
                      <span className="font-medium">{t(tool.labelKey, tool.defaultLabel)}</span>
                      {tool.id === 'compactView' && isCompact && (
                        <span className="text-accent ml-1 text-[10px] font-semibold">(Active)</span>
                      )}
                      {tool.id === 'favoriteArtists' && onlyFavoriteArtists && (
                        <span className="text-accent ml-1 text-[10px] font-semibold">(Active)</span>
                      )}
                      {tool.id === 'favoriteAlbums' && onlyFavoriteAlbums && (
                        <span className="text-accent ml-1 text-[10px] font-semibold">(Active)</span>
                      )}
                    </button>

                    {/* Pin / Unpin button */}
                    <button
                      type="button"
                      title={
                        isPinned
                          ? t('common.unpin', 'Unpin from toolbar')
                          : t('common.pin', 'Pin to toolbar')
                      }
                      className={`ml-2 cursor-pointer rounded-md p-1 transition-colors ${
                        isPinned
                          ? 'text-accent hover:bg-accent/10'
                          : 'text-font-color-dimmed hover:bg-background-color-2 dark:hover:bg-dark-background-color-2 opacity-40 hover:opacity-100'
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
