import type { BatchTrackData, BatchTrackRow, EditableField } from './types';

/** Splits a comma or semicolon separated string into a trimmed string array. */
export function parseStringList(val: string): string[] {
  if (!val) return [];
  return val
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Formats a string array into a comma-separated display string. */
export function formatStringList(list?: string[]): string {
  if (!list || list.length === 0) return '';
  return list.join(', ');
}

/** Displays track numbers with zero-padding when appropriate (e.g. 01, 02). */
export function formatTrackNumber(num?: number, maxTrackNum = 99): string {
  if (num == null || isNaN(num)) return '';
  if (maxTrackNum >= 10 && num < 10 && num >= 0) {
    return `0${num}`;
  }
  return String(num);
}

/** Validates editable field values and returns an error message if invalid. */
export function validateField(field: EditableField, value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null; // Empty values are permissible (allows clearing metadata)
  }

  if (field === 'trackNumber' || field === 'discNumber') {
    const num = Number(value);
    if (isNaN(num) || !Number.isInteger(num) || num < 1) {
      return 'Must be a positive integer (>= 1)';
    }
  }

  if (field === 'year') {
    const num = Number(value);
    if (isNaN(num) || !Number.isInteger(num) || num < 1000 || num > 9999) {
      return 'Must be a 4-digit year (1000-9999)';
    }
  }

  return null;
}

/** Determines if a specific field has been modified between original and draft data. */
export function isFieldDirty(
  field: EditableField,
  original: BatchTrackData,
  draft: BatchTrackData
): boolean {
  if (field === 'artists' || field === 'albumArtists' || field === 'genres') {
    const origList = original[field] || [];
    const draftList = draft[field] || [];
    if (origList.length !== draftList.length) return true;
    return origList.some((item, idx) => item !== draftList[idx]);
  }

  return original[field] !== draft[field];
}

/**
 * Constructs a canonical SongTags object for persistence via updateSongId3Tags. Safely starts with
 * the original SongTags and overlays ONLY the explicitly dirty fields, guaranteeing zero loss of
 * unedited metadata or rich nested attributes.
 */
export function buildCanonicalSongTags(row: BatchTrackRow, rawOriginalTags?: SongTags): SongTags {
  const { draft, dirtyFields } = row;

  const payload: SongTags = {
    title: draft.title || '',
    duration: row.duration,
    ...rawOriginalTags
  };

  if (dirtyFields.has('title')) {
    payload.title = draft.title || '';
  }
  if (dirtyFields.has('trackNumber')) {
    payload.trackNumber = draft.trackNumber;
  }
  if (dirtyFields.has('discNumber')) {
    payload.discNumber = draft.discNumber;
  }
  if (dirtyFields.has('year')) {
    payload.releasedYear = draft.year;
  }
  if (dirtyFields.has('composer')) {
    payload.composer = draft.composer;
  }

  if (dirtyFields.has('artists')) {
    const originalArtistsMap = new Map<string, number | undefined>();
    rawOriginalTags?.artists?.forEach((a) => {
      if (a.name) originalArtistsMap.set(a.name.toLowerCase(), a.artistId);
    });

    payload.artists = draft.artists.map((name) => ({
      name,
      artistId: originalArtistsMap.get(name.toLowerCase())
    }));
  }

  if (dirtyFields.has('albumArtists')) {
    const originalAlbumArtistsMap = new Map<string, number | undefined>();
    rawOriginalTags?.albumArtists?.forEach((a) => {
      if (a.name) originalAlbumArtistsMap.set(a.name.toLowerCase(), a.artistId);
    });

    payload.albumArtists = draft.albumArtists.map((name) => ({
      name,
      artistId: originalAlbumArtistsMap.get(name.toLowerCase())
    }));
  }

  if (dirtyFields.has('album')) {
    if (draft.album) {
      const origAlbum = rawOriginalTags?.albums?.[0];
      const albumId =
        origAlbum && origAlbum.title.toLowerCase() === draft.album.toLowerCase()
          ? origAlbum.albumId
          : undefined;
      payload.albums = [{ title: draft.album, albumId }];
    } else {
      payload.albums = [];
    }
  }

  if (dirtyFields.has('genres')) {
    const originalGenresMap = new Map<string, number | undefined>();
    rawOriginalTags?.genres?.forEach((g) => {
      if (g.name) originalGenresMap.set(g.name.toLowerCase(), g.genreId);
    });

    payload.genres = draft.genres.map((name) => ({
      name,
      genreId: originalGenresMap.get(name.toLowerCase())
    }));
  }

  return payload;
}
