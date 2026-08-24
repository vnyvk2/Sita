// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React, { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';

import SongGenresInput from '../../../../../../src/renderer/src/components/SongTagsEditingPage/input_containers/SongGenresInput';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'common.genre_other': 'Genres',
        'songTagsEditingPage.searchForGenres': 'Search for genres',
        'songTagsEditingPage.addNewGenre': 'Add New Genre'
      };
      return translations[key] || key;
    }
  })
}));

describe('SongGenresInput Component - Multi-Genre Delimiter & Tag Creation', () => {
  afterEach(() => {
    cleanup();
  });

  const TestWrapper = (props: {
    initialGenres?: Array<{ name: string; genreId?: number }>;
    genreResults?: Array<{ name: string; genreId?: number }>;
  }) => {
    const [songInfo, setSongInfo] = useState<SongTags>({
      title: 'Test Song',
      genres: props.initialGenres
    });
    const [keyword, setKeyword] = useState('');

    return (
      <SongGenresInput
        songGenres={songInfo.genres}
        genreResults={props.genreResults || []}
        genreKeyword={keyword}
        updateSongInfo={(cb) => setSongInfo((prev) => cb(prev))}
        updateGenreKeyword={(k) => setKeyword(k)}
      />
    );
  };

  it('immediately commits badge when comma is typed into input', () => {
    const { container } = render(<TestWrapper />);
    const input = screen.getByPlaceholderText('Search for genres') as HTMLInputElement;

    // Simulate typing "Rock,"
    fireEvent.change(input, { target: { value: 'Rock,' } });

    const genresContainer = container.querySelector('.genres-container');
    expect(genresContainer?.textContent).toContain('Rock');
    expect(input.value).toBe('');
  });

  it('immediately commits badge when semicolon is typed into input', () => {
    const { container } = render(<TestWrapper />);
    const input = screen.getByPlaceholderText('Search for genres') as HTMLInputElement;

    // Simulate typing "Pop;"
    fireEvent.change(input, { target: { value: 'Pop;' } });

    const genresContainer = container.querySelector('.genres-container');
    expect(genresContainer?.textContent).toContain('Pop');
    expect(input.value).toBe('');
  });

  it('immediately commits and splits multi-genre pasted text (e.g. "Rock, Pop, Indie; Jazz") on input change', () => {
    const { container } = render(<TestWrapper />);
    const input = screen.getByPlaceholderText('Search for genres') as HTMLInputElement;

    // Simulate pasting "Rock, Pop, Indie; Jazz" into input
    fireEvent.change(input, { target: { value: 'Rock, Pop, Indie; Jazz' } });

    const genresContainer = container.querySelector('.genres-container');
    expect(genresContainer?.textContent).toContain('Rock');
    expect(genresContainer?.textContent).toContain('Pop');
    expect(genresContainer?.textContent).toContain('Indie');
    expect(genresContainer?.textContent).toContain('Jazz');
    expect(input.value).toBe('');
  });

  it('commits a non-delimited genre name on Enter key', () => {
    const { container } = render(<TestWrapper />);
    const input = screen.getByPlaceholderText('Search for genres') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'Synthwave' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    const genresContainer = container.querySelector('.genres-container');
    expect(genresContainer?.textContent).toContain('Synthwave');
    expect(input.value).toBe('');
  });

  it('splits spaced slashes ("Rock / Pop") into two distinct badges', () => {
    const { container } = render(<TestWrapper />);
    const input = screen.getByPlaceholderText('Search for genres') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'Rock / Pop' } });
    const addButton = screen.getByText('Add New Genre');
    fireEvent.click(addButton);

    const genresContainer = container.querySelector('.genres-container');
    expect(genresContainer?.textContent).toContain('Rock');
    expect(genresContainer?.textContent).toContain('Pop');
  });

  it('preserves compound slash genres like "Hip-Hop/Rap" without splitting', () => {
    const { container } = render(<TestWrapper />);
    const input = screen.getByPlaceholderText('Search for genres') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'Hip-Hop/Rap' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    const genresContainer = container.querySelector('.genres-container');
    expect(genresContainer?.textContent).toContain('Hip-Hop/Rap');
  });

  it('matches existing library genres when available', () => {
    const genreResults = [
      { name: 'Alternative Rock', genreId: 42, artworkPath: 'art/42.webp' }
    ];

    const { container } = render(<TestWrapper genreResults={genreResults} />);
    const input = screen.getByPlaceholderText('Search for genres') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'alternative rock,' } });

    const genresContainer = container.querySelector('.genres-container');
    expect(genresContainer?.textContent).toContain('Alternative Rock');
  });
});
