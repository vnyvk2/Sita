import type { ImportedPlaylistEntry } from './ImportedPlaylistEntry';

export interface ImportedPlaylist {
  name: string;
  description?: string;
  entries: ImportedPlaylistEntry[];
  sourceFormat?: string;
  sourceFile?: string;
  createdByImporter?: string;
}
