// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import {
  resolveContextMenuTarget
} from './useSongListContextMenuDelegation';

describe('useSongListContextMenuDelegation - resolveContextMenuTarget', () => {
  const mockSong = {
    songId: 101,
    title: 'Test Track',
    duration: 180,
    path: '/path/test.mp3',
    isAFavorite: false,
    isBlacklisted: false,
    isArtworkAvailable: false,
    addedDate: Date.now(),
    artworkPaths: {
      isDefaultArtwork: true,
      artworkPath: '',
      optimizedArtworkPath: ''
    }
  } as unknown as SongData;

  const getItem = (index: number): SongData | undefined => {
    if (index === 0) return mockSong;
    return undefined;
  };

  it('resolves song and index from standard row element', () => {
    const row = document.createElement('div');
    row.setAttribute('data-song-id', '101');
    row.setAttribute('data-song-index', '0');

    const result = resolveContextMenuTarget(row, getItem);
    expect(result).not.toBeNull();
    expect(result?.songId).toBe(101);
    expect(result?.index).toBe(0);
    expect(result?.song.title).toBe('Test Track');
  });

  it('resolves target when clicking child text span or link within row', () => {
    const row = document.createElement('div');
    row.setAttribute('data-song-id', '101');
    row.setAttribute('data-song-index', '0');

    const titleLink = document.createElement('a');
    titleLink.className = 'song-title';
    titleLink.textContent = 'Test Track';
    row.appendChild(titleLink);

    const result = resolveContextMenuTarget(titleLink, getItem);
    expect(result).not.toBeNull();
    expect(result?.songId).toBe(101);
    expect(result?.index).toBe(0);
  });

  it('resolves target when clicking 3-dots more-options button', () => {
    const row = document.createElement('div');
    row.setAttribute('data-song-id', '101');
    row.setAttribute('data-song-index', '0');

    const moreBtn = document.createElement('button');
    moreBtn.setAttribute('data-more-options', 'true');
    row.appendChild(moreBtn);

    const result = resolveContextMenuTarget(moreBtn, getItem);
    expect(result).not.toBeNull();
    expect(result?.songId).toBe(101);
  });

  it('excludes regular buttons (e.g. play or favorite button) from context menu target', () => {
    const row = document.createElement('div');
    row.setAttribute('data-song-id', '101');
    row.setAttribute('data-song-index', '0');

    const playBtn = document.createElement('button');
    row.appendChild(playBtn);

    const result = resolveContextMenuTarget(playBtn, getItem);
    expect(result).toBeNull();
  });

  it('excludes checkbox / input elements from context menu target', () => {
    const row = document.createElement('div');
    row.setAttribute('data-song-id', '101');
    row.setAttribute('data-song-index', '0');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    row.appendChild(checkbox);

    const result = resolveContextMenuTarget(checkbox, getItem);
    expect(result).toBeNull();
  });

  it('returns null when clicking element outside any song row', () => {
    const container = document.createElement('div');
    const outsideBtn = document.createElement('button');
    container.appendChild(outsideBtn);

    const result = resolveContextMenuTarget(outsideBtn, getItem);
    expect(result).toBeNull();
  });

  it('guards strictly against NaN and missing attributes', () => {
    const row = document.createElement('div');
    row.setAttribute('data-song-id', 'invalid-id');
    row.setAttribute('data-song-index', '0');

    expect(resolveContextMenuTarget(row, getItem)).toBeNull();

    row.setAttribute('data-song-id', '101');
    row.setAttribute('data-song-index', 'not-a-number');
    expect(resolveContextMenuTarget(row, getItem)).toBeNull();

    row.removeAttribute('data-song-index');
    expect(resolveContextMenuTarget(row, getItem)).toBeNull();
  });

  it('returns null when song is not found in getItem', () => {
    const row = document.createElement('div');
    row.setAttribute('data-song-id', '101');
    row.setAttribute('data-song-index', '999'); // Out of bounds

    const result = resolveContextMenuTarget(row, getItem);
    expect(result).toBeNull();
  });
});
