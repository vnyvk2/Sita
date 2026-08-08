import type {
  MetadataWorkflow,
  WorkflowCandidate,
  WorkflowMatch,
  WorkflowPreview,
  WorkflowSupportedField,
  WorkflowType
} from '../MetadataWorkflow';
import type { DiscogsAdapter } from '../../providers/discogs/DiscogsAdapter';
import type { LocalSongInput } from '../../services/AlbumMetadataService';
import type { MetadataProviderId } from '../../models/RecordingMetadata';
import type { ResourceMutationPayload } from '../../domain/MetadataTransaction';

export class GenreWorkflow implements MetadataWorkflow {
  public readonly type: WorkflowType = 'genre';
  public readonly displayName = 'Genre & Style Auto Tag';

  public readonly supportedFields: WorkflowSupportedField[] = [
    { fieldId: 'genre', displayName: 'Genre', category: 'genre_style', defaultEnabled: true },
    { fieldId: 'style', displayName: 'Style', category: 'genre_style', defaultEnabled: true }
  ];

  public readonly preferredProviders: MetadataProviderId[] = ['discogs'];

  private readonly discogsAdapter: DiscogsAdapter;

  constructor(discogsAdapter: DiscogsAdapter) {
    this.discogsAdapter = discogsAdapter;
  }

  public async search(
    query: { title?: string; artist?: string; album?: string; limit?: number },
    _signal?: AbortSignal
  ): Promise<WorkflowCandidate[]> {
    const qStr = query.album || query.title || '';
    if (!qStr) return [];

    const albums = await this.discogsAdapter.searchAlbums(qStr, query.artist, query.limit ?? 10);

    const candidates: WorkflowCandidate[] = [];
    for (const alb of albums) {
      // Fetch contribution to obtain separate genre and style breakdown
      const contrib = await this.discogsAdapter.fetchContribution({
        title: alb.title,
        artist: alb.artist
      });

      const genreVal = contrib?.contributions.find((c) => c.fieldId === 'genre')?.value as string | undefined;
      const styleVal = contrib?.contributions.find((c) => c.fieldId === 'style')?.value as string | undefined;

      candidates.push({
        id: alb.releaseId || alb.title,
        title: alb.title,
        artist: alb.artist,
        album: alb.title,
        year: alb.year,
        genre: genreVal,
        style: styleVal,
        coverArtUrl: alb.artwork?.primaryPath || alb.artwork?.onlineUrls?.[0],
        provider: 'discogs',
        confidenceScore: 0.85
      });
    }

    return candidates;
  }

  public async buildPreview(
    localSongs: LocalSongInput[],
    candidateId: string,
    providerId: MetadataProviderId = 'discogs',
    _signal?: AbortSignal
  ): Promise<WorkflowPreview> {
    const release = await this.discogsAdapter.resolveRelease(candidateId);
    let genreVal: string | undefined;
    let styleVal: string | undefined;

    if (release) {
      const contrib = await this.discogsAdapter.fetchContribution({
        title: release.album.title,
        artist: release.album.artist
      });

      if (contrib) {
        const g = contrib.contributions.find((c) => c.fieldId === 'genre')?.value as string;
        const s = contrib.contributions.find((c) => c.fieldId === 'style')?.value as string;
        if (g) genreVal = g;
        if (s) styleVal = s;
      }
    }

    const matches: WorkflowMatch[] = localSongs.map((local) => {
      const genreDiffers = local.genre !== genreVal;
      const styleDiffers = Boolean(styleVal);

      return {
        localSongId: Number(local.songId),
        songPath: local.path || '',
        matchedCandidateId: candidateId,
        suggestedMetadata: {
          title: local.title,
          artist: local.artist,
          album: local.album,
          genre: genreVal ?? local.genre,
          style: styleVal
        },
        confidence: 0.85,
        fieldDiffs: [
          {
            fieldId: 'genre',
            oldValue: local.genre,
            suggestedValue: genreVal ?? local.genre,
            status: genreDiffers ? 'changed' : 'unchanged',
            applyField: genreDiffers,
            providerId
          },
          {
            fieldId: 'style',
            oldValue: undefined,
            suggestedValue: styleVal,
            status: styleDiffers ? 'added' : 'unchanged',
            applyField: styleDiffers,
            providerId
          }
        ]
      };
    });

    const primaryCandidate: WorkflowCandidate = {
      id: candidateId,
      title: release?.album.title ?? 'Unknown Release',
      artist: release?.album.artist ?? 'Unknown Artist',
      genre: genreVal,
      style: styleVal,
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
