export interface BatchTrackData {
  songId: number;
  path: string;
  duration: number;
  title: string;
  artists: string[];
  albumArtists: string[];
  album: string;
  genres: string[];
  trackNumber?: number;
  discNumber?: number;
  year?: number;
  composer?: string;
  language?: string;
}

export type EditableField =
  | 'title'
  | 'artists'
  | 'album'
  | 'albumArtists'
  | 'genres'
  | 'trackNumber'
  | 'discNumber'
  | 'year'
  | 'composer'
  | 'language';

export interface BatchTrackRow {
  songId: number;
  path: string;
  duration: number;
  original: BatchTrackData;
  draft: BatchTrackData;
  dirtyFields: Set<EditableField>;
  validationErrors: Map<EditableField, string>;
  status?: BatchSongUpdateStatus | 'file-write-failed' | 'database-update-failed';
  errorMessage?: string;
}

export interface BatchEditStats {
  totalRows: number;
  selectedCount: number;
  modifiedTrackCount: number;
  totalFieldsChanged: number;
  hasValidationErrors: boolean;
}
