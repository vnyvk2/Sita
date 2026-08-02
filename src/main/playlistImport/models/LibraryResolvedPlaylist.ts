import type { LibraryResolvedPlaylistEntry } from './LibraryResolvedPlaylistEntry';

export interface LibraryResolvedPlaylist {
  name: string;
  description?: string;
  entries: LibraryResolvedPlaylistEntry[];
  sourceFormat?: string;
  sourceFile?: string;
  createdByImporter?: string;
}
