/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  getValidPinnedTools,
  SUB_FILTER_TOOLS
} from '../../../../../../src/renderer/src/components/SongsPage/SubFilterToolbar/subFilterRegistry';
import {
  SubFilterToolbar,
  type SubFilterToolbarProps
} from '../../../../../../src/renderer/src/components/SongsPage/SubFilterToolbar/SubFilterToolbar';
import { store } from '../../../../../../src/renderer/src/store/store';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, defaultValOrOptions?: any) => {
        if (typeof defaultValOrOptions === 'string') return defaultValOrOptions;
        return key;
      }
    })
  };
});

describe('SubFilterToolbar & subFilterRegistry', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('subFilterRegistry & getValidPinnedTools', () => {
    it('returns default pinned tools for songs context', () => {
      const pinned = getValidPinnedTools('songs', undefined);
      expect(pinned).toEqual(['compactView', 'language', 'genre']);
    });

    it('returns default pinned tools for playlist context (no genre, fav artists, fav albums)', () => {
      const pinned = getValidPinnedTools('playlist', undefined);
      expect(pinned).toEqual(['compactView', 'language']);
    });

    it('filters out invalid or context-incompatible tools from stored preferences', () => {
      const stored = ['compactView', 'genre', 'favoriteArtists', 'unknownTool', 'favoriteAlbums'];
      // In playlist context, only compactView and language are valid
      const playlistPinned = getValidPinnedTools('playlist', stored);
      expect(playlistPinned).toEqual(['compactView']);

      // In songs context, valid ones are kept, unknownTool is discarded
      const songsPinned = getValidPinnedTools('songs', stored);
      expect(songsPinned).toEqual(['compactView', 'genre', 'favoriteArtists', 'favoriteAlbums']);
    });

    it('falls back to defaults if stored list is empty or completely invalid', () => {
      const fallback = getValidPinnedTools('songs', ['invalidTool1', 'invalidTool2']);
      expect(fallback).toEqual(['compactView', 'language', 'genre']);
    });
  });

  describe('SubFilterToolbar component', () => {
    const defaultProps: SubFilterToolbarProps = {
      context: 'songs',
      isCompact: false,
      onToggleCompact: vi.fn(),
      language: 'all',
      languageOptions: [
        { label: 'All Languages', value: 'all' },
        { label: 'English', value: 'en' }
      ],
      onLanguageChange: vi.fn(),
      genre: 'all',
      genreOptions: [
        { label: 'All Genres', value: 'all' },
        { label: 'Rock', value: 'rock' }
      ],
      onGenreChange: vi.fn(),
      onlyFavoriteArtists: false,
      onToggleFavoriteArtists: vi.fn(),
      onlyFavoriteAlbums: false,
      onToggleFavoriteAlbums: vi.fn(),
      onClearDuplicates: vi.fn(),
      hasActiveSubFilters: false,
      onClearSubFilters: vi.fn()
    };

    it('renders pinned Compact View button with only symbol and calls onToggleCompact on click', () => {
      render(<SubFilterToolbar {...defaultProps} />);

      const compactBtn = screen.getByRole('button', { name: /compact view/i });
      expect(compactBtn).toBeDefined();
      expect(compactBtn.querySelector('.button-label-text')).toBeNull();

      fireEvent.click(compactBtn);
      expect(defaultProps.onToggleCompact).toHaveBeenCalledTimes(1);
    });

    it('opens 3-dots popup menu and shows available tools for songs context', () => {
      render(<SubFilterToolbar {...defaultProps} />);

      const moreBtn = screen.getByTitle(/more tools/i);
      expect(moreBtn).toBeDefined();

      fireEvent.click(moreBtn);

      // Verify popup content
      expect(screen.getByText(/toolbar tools/i)).toBeDefined();
      expect(screen.getByText('Clear Dups')).toBeDefined();
      expect(screen.getByText('Fav Artists')).toBeDefined();
      expect(screen.getByText('Fav Albums')).toBeDefined();
    });

    it('in playlist context, 3-dots menu only exposes playlist-compatible tools', () => {
      render(<SubFilterToolbar {...defaultProps} context="playlist" />);

      const moreBtn = screen.getByTitle(/more tools/i);
      fireEvent.click(moreBtn);

      // Compact View and Language are present
      expect(screen.getAllByText('Compact View').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Language').length).toBeGreaterThan(0);

      // Songs-only tools are NOT present
      expect(screen.queryByText('Clear Dups')).toBeNull();
      expect(screen.queryByText('Fav Artists')).toBeNull();
      expect(screen.queryByText('Fav Albums')).toBeNull();
      expect(screen.queryByText('Genre')).toBeNull();
    });

    it('shows Clear filters button when hasActiveSubFilters is true', () => {
      const { rerender } = render(
        <SubFilterToolbar {...defaultProps} hasActiveSubFilters={false} />
      );
      expect(screen.queryByTitle(/clear sub-filters/i)).toBeNull();

      rerender(<SubFilterToolbar {...defaultProps} hasActiveSubFilters={true} />);
      const clearBtn = screen.getByTitle(/clear sub-filters/i);
      expect(clearBtn).toBeDefined();

      fireEvent.click(clearBtn);
      expect(defaultProps.onClearSubFilters).toHaveBeenCalledTimes(1);
    });

    it('ensures sub-filters-container and pinned pills container have overflow-visible and z-20 so dropdown is not clipped', () => {
      const { container } = render(<SubFilterToolbar {...defaultProps} />);
      const toolbarDiv = container.querySelector('.sub-filters-container');
      expect(toolbarDiv).toBeDefined();
      expect(toolbarDiv?.className).toContain('overflow-visible');
      expect(toolbarDiv?.className).toContain('z-20');
      expect(toolbarDiv?.className).not.toContain('overflow-hidden');

      // Verify the inner pinned container does not have overflow-x-hidden
      const pinnedContainer = toolbarDiv?.firstElementChild as HTMLElement;
      expect(pinnedContainer).toBeDefined();
      expect(pinnedContainer?.className).toContain('overflow-visible');
      expect(pinnedContainer?.className).not.toContain('overflow-x-hidden');

      // Verify dropdown containers within toolbar have ml-0! for clean pill alignment
      const languageDropdown = container.querySelector('.dropdown-container');
      expect(languageDropdown?.className).toContain('ml-0!');
    });

    it('clicking an unpinned tool row in 3-dots menu pins it to the toolbar', () => {
      // Setup store with only compactView pinned
      store.setState((prev) => ({
        ...prev,
        localStorage: {
          ...prev.localStorage,
          preferences: {
            ...prev.localStorage.preferences,
            pinnedSubFilterTools: ['compactView']
          }
        }
      }));

      render(<SubFilterToolbar {...defaultProps} />);

      const moreBtn = screen.getByTitle(/more tools/i);
      fireEvent.click(moreBtn);

      // Language should be unpinned currently
      const languageRow = screen.getByText('Language').closest('button');
      expect(languageRow).toBeDefined();

      if (languageRow) {
        fireEvent.click(languageRow);
      }

      // Should now be pinned in store
      expect(store.state.localStorage.preferences.pinnedSubFilterTools).toContain('language');
    });

    it('toggles 3-dots menu closed when clicking the 3-dots button again', () => {
      render(<SubFilterToolbar {...defaultProps} />);

      const moreBtn = screen.getByTitle(/more tools/i);
      // Open
      fireEvent.click(moreBtn);
      expect(screen.getByText(/toolbar tools/i)).toBeDefined();

      // Close by clicking the button again
      fireEvent.click(moreBtn);
      expect(screen.queryByText(/toolbar tools/i)).toBeNull();
    });

    it('closes 3-dots menu on outside mousedown', () => {
      render(
        <div>
          <div data-testid="outside-element">Outside</div>
          <SubFilterToolbar {...defaultProps} />
        </div>
      );

      const moreBtn = screen.getByTitle(/more tools/i);
      fireEvent.click(moreBtn);
      expect(screen.getByText(/toolbar tools/i)).toBeDefined();

      // Click outside
      fireEvent.mouseDown(screen.getByTestId('outside-element'));
      expect(screen.queryByText(/toolbar tools/i)).toBeNull();
    });

    it('closes 3-dots menu on Escape key press', () => {
      render(<SubFilterToolbar {...defaultProps} />);

      const moreBtn = screen.getByTitle(/more tools/i);
      fireEvent.click(moreBtn);
      expect(screen.getByText(/toolbar tools/i)).toBeDefined();

      // Press Escape
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByText(/toolbar tools/i)).toBeNull();
    });
  });
});
