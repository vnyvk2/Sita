export interface MusicBrainzArtistCreditDto {
  name?: string;
  artist?: MusicBrainzArtistDto;
  joinphrase?: string;
}

export interface MusicBrainzArtistDto {
  id: string;
  name: string;
  'sort-name'?: string;
  type?: string;
  country?: string;
  disambiguation?: string;
  aliases?: Array<{ name: string; 'sort-name'?: string; type?: string }>;
  tags?: Array<{ name: string; count?: number }>;
  genres?: Array<{ name: string; count?: number }>;
  relations?: Array<{ type: string; url?: { resource: string }; artist?: MusicBrainzArtistDto }>;
}
