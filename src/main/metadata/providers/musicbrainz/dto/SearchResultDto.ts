import type { MusicBrainzArtistDto } from './ArtistDto';
import type { MusicBrainzRecordingDto } from './RecordingDto';
import type { MusicBrainzReleaseDto } from './ReleaseDto';

export interface MusicBrainzRecordingSearchResultDto {
  created: string;
  count: number;
  offset: number;
  recordings: MusicBrainzRecordingDto[];
}

export interface MusicBrainzReleaseSearchResultDto {
  created: string;
  count: number;
  offset: number;
  releases: MusicBrainzReleaseDto[];
}

export interface MusicBrainzArtistSearchResultDto {
  created: string;
  count: number;
  offset: number;
  artists: MusicBrainzArtistDto[];
}
