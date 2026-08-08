import type {
  MetadataWorkflow,
  WorkflowCandidate,
  WorkflowMatch,
  WorkflowPreview,
  WorkflowSupportedField,
  WorkflowType
} from '../MetadataWorkflow';
import type { AlbumMetadataService } from '../../services/AlbumMetadataService';
import type { LocalSongInput } from '../../services/AlbumMetadataService';
import type { AlbumMetadata, MetadataProviderId } from '../../models/RecordingMetadata';
import type { ResourceMutationPayload } from '../../domain/MetadataTransaction';

export class AlbumWorkflow implements MetadataWorkflow {
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
      query.limit ?? 10
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
  ): Promise<WorkflowPreview> {
    const release = await this.albumMetadataService.resolveRelease(candidateId, providerId);
    if (!release) {
      throw new Error(`[AlbumWorkflow] Release ${candidateId} could not be resolved from provider ${providerId}`);
    }

    const matches: WorkflowMatch[] = localSongs.map((local, idx) => {
      const matchedTrack = release.tracks[idx] || release.tracks[0];
      const titleDiffers = local.title !== matchedTrack?.title;
      const artistDiffers = local.artist !== release.album.artist;
      const albumDiffers = local.album !== release.album.title;

      return {
        localSongId: Number(local.songId),
        songPath: local.path || '',
        matchedCandidateId: candidateId,
        suggestedMetadata: {
          title: matchedTrack?.title ?? local.title,
          artist: release.album.artist ?? local.artist,
          album: release.album.title ?? local.album,
          year: release.album.year ?? local.year,
          genre: local.genre,
          trackNumber: matchedTrack?.trackNumber ?? idx + 1
        },
        confidence: 0.9,
        fieldDiffs: [
          {
            fieldId: 'title',
            oldValue: local.title,
            suggestedValue: matchedTrack?.title ?? local.title,
            status: titleDiffers ? 'changed' : 'unchanged',
            applyField: titleDiffers,
            providerId
          },
          {
            fieldId: 'artist',
            oldValue: local.artist,
            suggestedValue: release.album.artist ?? local.artist,
            status: artistDiffers ? 'changed' : 'unchanged',
            applyField: artistDiffers,
            providerId
          },
          {
            fieldId: 'album',
            oldValue: local.album,
            suggestedValue: release.album.title ?? local.album,
            status: albumDiffers ? 'changed' : 'unchanged',
            applyField: albumDiffers,
            providerId
          },
          {
            fieldId: 'year',
            oldValue: local.year,
            suggestedValue: release.album.year ?? local.year,
            status: local.year !== release.album.year ? 'changed' : 'unchanged',
            applyField: local.year !== release.album.year,
            providerId
          }
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

  public buildMutations(
    preview: WorkflowPreview,
    selectedFieldIds?: string[]
  ): ResourceMutationPayload[] {
    const fieldsToApply = new Set(selectedFieldIds ?? this.supportedFields.map((f) => f.fieldId));

    return preview.matches.map((m) => ({
      resourceId: m.localSongId,
      filePath: m.songPath,
      fieldMutations: m.fieldDiffs
        .filter((d) => fieldsToApply.has(d.fieldId) && d.applyField && d.status !== 'unchanged')
        .map((d) => ({
          fieldId: d.fieldId,
          oldValue: d.oldValue,
          newValue: d.userValue ?? d.suggestedValue,
          providerId: preview.provider,
          confidenceScore: m.confidence
        }))
    }));
  }
}
