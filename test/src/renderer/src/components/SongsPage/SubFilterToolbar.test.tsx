/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { store } from '../../../../../../src/renderer/src/store/store';
import {
  SubFilterToolbar,
  type SubFilterToolbarProps
} from '../../../../../../src/renderer/src/components/SongsPage/SubFilterToolbar/SubFilterToolbar';
import {
  getValidPinnedTools,
  SUB_FILTER_TOOLS
} from '../../../../../../src/renderer/src/components/SongsPage/SubFilterToolbar/subFilterRegistry';

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
      languageOptions: [{ label: 'All Languages', value: 'all' }, { label: 'English', value: 'en' }],
      onLanguageChange: vi.fn(),
      genre: 'all',
      genreOptions: [{ label: 'All Genres', value: 'all' }, { label: 'Rock', value: 'rock' }],
      onGenreChange: vi.fn(),
      onlyFavoriteArtists: false,
      onToggleFavoriteArtists: vi.fn(),
      onlyFavoriteAlbums: false,
      onToggleFavoriteAlbums: vi.fn(),
      onClearDuplicates: vi.fn(),
      hasActiveSubFilters: false,
      onClearSubFilters: vi.fn()
    };

    it('renders pinned Compact View button and calls onToggleCompact on click', () => {
      render(<SubFilterToolbar {...defaultProps} />);

      const compactBtn = screen.getByRole('button', { name: /compact view/i });
      expect(compactBtn).toBeDefined();

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
      expect(screen.getByText('Clear Duplicates')).toBeDefined();
      expect(screen.getByText('Favorite Artists')).toBeDefined();
      expect(screen.getByText('Favorite Albums')).toBeDefined();
    });

    it('in playlist context, 3-dots menu only exposes playlist-compatible tools', () => {
      render(<SubFilterToolbar {...defaultProps} context="playlist" />);

      const moreBtn = screen.getByTitle(/more tools/i);
      fireEvent.click(moreBtn);

      // Compact View and Language are present
      expect(screen.getAllByText('Compact View').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Language').length).toBeGreaterThan(0);

      // Songs-only tools are NOT present
      expect(screen.queryByText('Clear Duplicates')).toBeNull();
      expect(screen.queryByText('Favorite Artists')).toBeNull();
      expect(screen.queryByText('Favorite Albums')).toBeNull();
      expect(screen.queryByText('Genre')).toBeNull();
    });

    it('shows Clear filters button when hasActiveSubFilters is true', () => {
      const { rerender } = render(<SubFilterToolbar {...defaultProps} hasActiveSubFilters={false} />);
      expect(screen.queryByTitle(/clear sub-filters/i)).toBeNull();

      rerender(<SubFilterToolbar {...defaultProps} hasActiveSubFilters={true} />);
      const clearBtn = screen.getByTitle(/clear sub-filters/i);
      expect(clearBtn).toBeDefined();

      fireEvent.click(clearBtn);
      expect(defaultProps.onClearSubFilters).toHaveBeenCalledTimes(1);
    });
  });
});
