import type { MusicBrainzArtistCreditDto } from './ArtistDto';

export interface MusicBrainzReleaseDto {
  id: string;
  title: string;
  status?: string;
  date?: string;
  country?: string;
  barcode?: string;
  'artist-credit'?: MusicBrainzArtistCreditDto[];
  'release-group'?: {
    id: string;
    title: string;
    'primary-type'?: string;
    'secondary-types'?: string[];
  };
  media?: Array<{
    format?: string;
    'track-count'?: number;
    tracks?: Array<{
      id: string;
      position: number;
      number: string;
      title: string;
      length?: number;
    }>;
  }>;
}
