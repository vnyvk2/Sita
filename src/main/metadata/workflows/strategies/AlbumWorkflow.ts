import type {
  WorkflowCandidate,
  WorkflowMatch,
  MetadataPreview,
  WorkflowSupportedField,
  WorkflowType
} from '../MetadataWorkflow';
import { BaseMetadataWorkflow } from '../MetadataWorkflow';
import type { AlbumMetadataService } from '../../services/AlbumMetadataService';
import type { LocalSongInput } from '../../services/AlbumMetadataService';
import type { AlbumMetadata, MetadataProviderId } from '../../models/RecordingMetadata';
import { MetadataDiffBuilder } from '../../diff/MetadataDiffBuilder';

export class AlbumWorkflow extends BaseMetadataWorkflow {
  public readonly type: WorkflowType = 'album';
  public readonly displayName = 'Album Auto Tag';

  public readonly supportedFields: WorkflowSupportedField[] = [
    { fieldId: 'title', displayName: 'Title', category: 'core', defaultEnabled: true },
    { fieldId: 'artist', displayName: 'Artist', category: 'core', defaultEnabled: true },
    { fieldId: 'album', displayName: 'Album', category: 'core', defaultEnabled: true },
    { fieldId: 'year', displayName: 'Year', category: 'core', defaultEnabled: true },
    { fieldId: 'trackNumber', displayName: 'Track #', category: 'core', defaultEnabled: true },
    { fieldId: 'genre', displayName: 'Genre', category: 'genre_style', defaultEnabled: true }
  ];

  public readonly preferredProviders: MetadataProviderId[] = ['musicbrainz', 'discogs'];

  private readonly albumMetadataService: AlbumMetadataService;

  constructor(albumMetadataService: AlbumMetadataService) {
    super();
    this.albumMetadataService = albumMetadataService;
  }

  public async search(
    query: { title?: string; artist?: string; album?: string; limit?: number },
    _signal?: AbortSignal
  ): Promise<WorkflowCandidate[]> {
    const searchAlbum = query.album || query.title || '';
    if (!searchAlbum) return [];

    const albums = await this.albumMetadataService.searchAlbums(
      searchAlbum,
      query.artist,
      { limit: query.limit ?? 10 }
    );

    return albums.map((alb: AlbumMetadata) => ({
      id: alb.releaseId || alb.title,
      title: alb.title,
      artist: alb.artist,
      album: alb.title,
      year: alb.year,
      coverArtUrl: alb.artwork?.primaryPath || alb.artwork?.onlineUrls?.[0],
      provider: alb.provider ?? 'musicbrainz',
      rawItem: alb
    }));
  }

  public async buildPreview(
    localSongs: LocalSongInput[],
    candidateId: string,
    providerId: MetadataProviderId = 'musicbrainz',
    _signal?: AbortSignal
  ): Promise<MetadataPreview> {
    const release = await this.albumMetadataService.resolveRelease(candidateId, providerId);
    if (!release) {
      throw new Error(`[AlbumWorkflow] Release ${candidateId} could not be resolved from provider ${providerId}`);
    }

    const matches: WorkflowMatch[] = localSongs.map((local, idx) => {
      const matchedTrack = release.tracks[idx] || release.tracks[0];
      const suggestedTitle = matchedTrack?.title ?? local.title;
      const suggestedArtist = release.album.artist ?? local.artist;
      const suggestedAlbum = release.album.title ?? local.album;
      const suggestedYear = release.album.year ?? local.year;

      return {
        localSongId: Number(local.songId),
        songPath: local.path || '',
        matchedCandidateId: candidateId,
        suggestedMetadata: {
          title: suggestedTitle,
          artist: suggestedArtist,
          album: suggestedAlbum,
          year: suggestedYear,
          genre: local.genre,
          trackNumber: matchedTrack?.trackNumber ?? idx + 1
        },
        confidence: 0.9,
        fieldDiffs: [
          MetadataDiffBuilder.createFieldDiff({ fieldId: 'title', oldVal: local.title, newVal: suggestedTitle, providerId, confidenceScore: 0.9 }),
          MetadataDiffBuilder.createFieldDiff({ fieldId: 'artist', oldVal: local.artist, newVal: suggestedArtist, providerId, confidenceScore: 0.9 }),
          MetadataDiffBuilder.createFieldDiff({ fieldId: 'album', oldVal: local.album, newVal: suggestedAlbum, providerId, confidenceScore: 0.9 }),
          MetadataDiffBuilder.createFieldDiff({ fieldId: 'year', oldVal: local.year, newVal: suggestedYear, providerId, confidenceScore: 0.9 })
        ]
      };
    });

    const primaryCandidate: WorkflowCandidate = {
      id: release.providerReleaseId,
      title: release.album.title,
      artist: release.album.artist,
      year: release.album.year,
      coverArtUrl: release.album.artwork?.primaryPath || release.album.artwork?.onlineUrls?.[0],
      provider: providerId
    };

    return {
      workflowType: this.type,
      primaryCandidate,
      candidates: [primaryCandidate],
      matches,
      supportedFields: this.supportedFields,
      provider: providerId
    };
  }
}
