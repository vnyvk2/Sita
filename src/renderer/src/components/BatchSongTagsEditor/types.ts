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
  | 'composer';

export interface BatchTrackRow {
  songId: number;
  path: string;
  duration: number;
  original: BatchTrackData;
  draft: BatchTrackData;
  dirtyFields: Set<EditableField>;
  validationErrors: Map<EditableField, string>;
  status?: 'saved' | 'file-write-failed' | 'database-update-failed' | 'skipped';
  errorMessage?: string;
}

export interface BatchEditStats {
  totalRows: number;
  selectedCount: number;
  modifiedTrackCount: number;
  totalFieldsChanged: number;
  hasValidationErrors: boolean;
}
