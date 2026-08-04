export interface SongPersistenceDTO {
  id: number;
  title: string;
  artists?: { artist: { id: number; name: string } }[];
  albums?: { album: { id: number; title: string } }[];
  genres?: { genre: { id: number; name: string } }[];
  year?: number | null;
  trackNumber?: number | null;
  duration?: number | null;
  bitrate?: number | null;
  sampleRate?: number | null;
  fileModifiedAt?: Date | null;
  language?: string | null;
  tags?: string[] | null;
  comment?: string | null;
  rating?: number | null;
  composer?: string | null;
}

export interface ArtistPersistenceDTO {
  id: number;
  name: string;
  albums?: { album: { id: number; title: string } }[];
  songs?: { song: { id: number; title: string } }[];
}

export interface AlbumPersistenceDTO {
  id: number;
  title: string;
  artists?: { artist: { id: number; name: string } }[];
  songs?: { song: { id: number; title: string } }[];
}

export interface GenrePersistenceDTO {
  id: number;
  name: string;
  songs?: { song: { id: number; title: string } }[];
}

export interface PlaylistPersistenceDTO {
  id: number;
  name: string;
  description?: string | null;
}

export type EntityPersistenceDTO =
  | SongPersistenceDTO
  | ArtistPersistenceDTO
  | AlbumPersistenceDTO
  | GenrePersistenceDTO
  | PlaylistPersistenceDTO;
