import type { ResolvedPlaylistEntry } from './ResolvedPlaylistEntry';

export interface ResolvedPlaylist {
  name: string;
  description?: string;
  entries: ResolvedPlaylistEntry[];
  sourceFormat?: string;
  sourceFile?: string;
  createdByImporter?: string;
}
