import type { MusicBrainzArtistCreditDto } from './ArtistDto';

export interface MusicBrainzReleaseDto {
  id: string;
  title: string;
  status?: string;
  date?: string;
  country?: string;
  barcode?: string;
  score?: number;
  'media-count'?: number;
  tags?: Array<{ name: string; count?: number }>;
  genres?: Array<{ name: string; count?: number }>;
  'artist-credit'?: MusicBrainzArtistCreditDto[];
  'label-info'?: Array<{
    label?: {
      id?: string;
      name?: string;
    };
  }>;
  'release-group'?: {
    id: string;
    title: string;
    'primary-type'?: string;
    'secondary-types'?: string[];
  };
  media?: Array<{
    format?: string;
    'track-count'?: number;
    position?: number;
    track?: Array<{
      id?: string;
      position?: number;
      number?: string;
      title?: string;
      length?: number;
    }>;
    tracks?: Array<{
      id: string;
      position?: number;
      number?: string;
      title?: string;
      length?: number;
      'artist-credit'?: MusicBrainzArtistCreditDto[];
      recording?: {
        id: string;
        title: string;
        length?: number;
        'artist-credit'?: MusicBrainzArtistCreditDto[];
      };
    }>;
  }>;
}
