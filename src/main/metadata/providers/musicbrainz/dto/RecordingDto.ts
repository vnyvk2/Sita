import type { MusicBrainzArtistCreditDto } from './ArtistDto';
import type { MusicBrainzReleaseDto } from './ReleaseDto';

export interface MusicBrainzRecordingDto {
  id: string;
  title: string;
  length?: number;
  video?: boolean;
  disambiguation?: string;
  'first-release-date'?: string;
  'artist-credit'?: MusicBrainzArtistCreditDto[];
  releases?: MusicBrainzReleaseDto[];
  tags?: Array<{ name: string; count?: number }>;
  genres?: Array<{ name: string; count?: number }>;
  isrcs?: string[];
  score?: number;
}
