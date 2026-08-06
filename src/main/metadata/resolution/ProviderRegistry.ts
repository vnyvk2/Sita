export interface ProviderCapabilities {
  supportsAlbumSearch: boolean;
  supportsTrackSearch: boolean;
  supportsArtistSearch: boolean;
  supportsCoverArt: boolean;
  supportsHighResArtwork: boolean;
  supportsGenres: boolean;
  supportsISRC: boolean;
}

export interface ProviderDescriptor {
  id: string;
  displayName: string;
  icon: string;
  website: string;
  priority: number;
  capabilities: ProviderCapabilities;
}

export class ProviderRegistry {
  private readonly providers: Map<string, ProviderDescriptor> = new Map();

  constructor() {
    this.registerDefaultDescriptors();
  }

  private registerDefaultDescriptors(): void {
    this.register({
      id: 'musicbrainz',
      displayName: 'MusicBrainz',
      icon: 'musicbrainz-icon',
      website: 'https://musicbrainz.org',
      priority: 900,
      capabilities: {
        supportsAlbumSearch: true,
        supportsTrackSearch: true,
        supportsArtistSearch: true,
        supportsCoverArt: false,
        supportsHighResArtwork: false,
        supportsGenres: true,
        supportsISRC: true
      }
    });

    this.register({
      id: 'discogs',
      displayName: 'Discogs',
      icon: 'discogs-icon',
      website: 'https://discogs.com',
      priority: 800,
      capabilities: {
        supportsAlbumSearch: true,
        supportsTrackSearch: true,
        supportsArtistSearch: true,
        supportsCoverArt: true,
        supportsHighResArtwork: true,
        supportsGenres: true,
        supportsISRC: false
      }
    });

    this.register({
      id: 'coverartarchive',
      displayName: 'Cover Art Archive',
      icon: 'caa-icon',
      website: 'https://coverartarchive.org',
      priority: 850,
      capabilities: {
        supportsAlbumSearch: false,
        supportsTrackSearch: false,
        supportsArtistSearch: false,
        supportsCoverArt: true,
        supportsHighResArtwork: true,
        supportsGenres: false,
        supportsISRC: false
      }
    });

    this.register({
      id: 'spotify',
      displayName: 'Spotify',
      icon: 'spotify-icon',
      website: 'https://spotify.com',
      priority: 700,
      capabilities: {
        supportsAlbumSearch: true,
        supportsTrackSearch: true,
        supportsArtistSearch: true,
        supportsCoverArt: true,
        supportsHighResArtwork: true,
        supportsGenres: true,
        supportsISRC: true
      }
    });

    this.register({
      id: 'apple',
      displayName: 'Apple Music',
      icon: 'apple-icon',
      website: 'https://music.apple.com',
      priority: 650,
      capabilities: {
        supportsAlbumSearch: true,
        supportsTrackSearch: true,
        supportsArtistSearch: true,
        supportsCoverArt: true,
        supportsHighResArtwork: true,
        supportsGenres: true,
        supportsISRC: true
      }
    });
  }

  public register(descriptor: ProviderDescriptor): void {
    this.providers.set(descriptor.id.toLowerCase(), descriptor);
  }

  public getDescriptor(providerId: string): ProviderDescriptor | undefined {
    return this.providers.get(providerId.toLowerCase());
  }

  public getDisplayName(providerId: string): string {
    const desc = this.getDescriptor(providerId);
    return desc?.displayName ?? providerId;
  }

  public listDescriptors(): ProviderDescriptor[] {
    return Array.from(this.providers.values()).sort((a, b) => b.priority - a.priority);
  }
}
