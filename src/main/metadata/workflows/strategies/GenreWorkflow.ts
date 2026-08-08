import type {
  WorkflowCandidate,
  WorkflowMatch,
  MetadataPreview,
  WorkflowSupportedField,
  WorkflowType
} from '../MetadataWorkflow';
import { BaseMetadataWorkflow } from '../MetadataWorkflow';
import type { DiscogsAdapter } from '../../providers/discogs/DiscogsAdapter';
import type { LocalSongInput } from '../../services/AlbumMetadataService';
import type { MetadataProviderId } from '../../models/RecordingMetadata';
import { MetadataDiffBuilder } from '../../diff/MetadataDiffBuilder';

export class GenreWorkflow extends BaseMetadataWorkflow {
  public readonly type: WorkflowType = 'genre';
  public readonly displayName = 'Genre & Style Auto Tag';

  public readonly supportedFields: WorkflowSupportedField[] = [
    { fieldId: 'genre', displayName: 'Genre', category: 'genre_style', defaultEnabled: true },
    { fieldId: 'style', displayName: 'Style', category: 'genre_style', defaultEnabled: true }
  ];

  public readonly preferredProviders: MetadataProviderId[] = ['discogs'];

  private readonly discogsAdapter: DiscogsAdapter;
  private readonly searchCache: Map<string, { genre?: string; style?: string; title?: string; artist?: string }> = new Map();

  constructor(discogsAdapter: DiscogsAdapter) {
    super();
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

      const candidateId = alb.releaseId || alb.title;
      this.searchCache.set(candidateId, { genre: genreVal, style: styleVal, title: alb.title, artist: alb.artist });

      candidates.push({
        id: candidateId,
        title: alb.title,
        artist: alb.artist,
        album: alb.title,
        year: alb.year,
        genre: genreVal,
        style: styleVal,
        coverArtUrl: alb.artwork?.primaryPath || alb.artwork?.onlineUrls?.[0],
        provider: 'discogs',
        confidenceScore: 0.85,
        rawItem: { album: alb, contrib }
      });
    }

    return candidates;
  }

  public async buildPreview(
    localSongs: LocalSongInput[],
    candidateId: string,
    providerId: MetadataProviderId = 'discogs',
    _signal?: AbortSignal
  ): Promise<MetadataPreview> {
    // 1. First check searchCache to eliminate duplicate network calls to Discogs!
    let genreVal: string | undefined;
    let styleVal: string | undefined;
    let candidateTitle = 'Unknown Release';
    let candidateArtist = 'Unknown Artist';

    const cached = this.searchCache.get(candidateId);
    if (cached) {
      genreVal = cached.genre;
      styleVal = cached.style;
      candidateTitle = cached.title ?? candidateTitle;
      candidateArtist = cached.artist ?? candidateArtist;
    } else {
      // Fallback: resolve release if search cache expired/missed
      const release = await this.discogsAdapter.resolveRelease(candidateId);
      if (release) {
        candidateTitle = release.album.title;
        candidateArtist = release.album.artist;

        const contrib = await this.discogsAdapter.fetchContribution({
          title: release.album.title,
          artist: release.album.artist
        });

        if (contrib) {
          genreVal = contrib.contributions.find((c) => c.fieldId === 'genre')?.value as string | undefined;
          styleVal = contrib.contributions.find((c) => c.fieldId === 'style')?.value as string | undefined;
        }
      }
    }

    const matches: WorkflowMatch[] = localSongs.map((local) => {
      const suggestedGenre = genreVal ?? local.genre;
      const suggestedStyle = styleVal;

      return {
        localSongId: Number(local.songId),
        songPath: local.path || '',
        matchedCandidateId: candidateId,
        suggestedMetadata: {
          title: local.title,
          artist: local.artist,
          album: local.album,
          genre: suggestedGenre,
          style: suggestedStyle
        },
        confidence: 0.85,
        fieldDiffs: [
          MetadataDiffBuilder.createFieldDiff('genre', local.genre, suggestedGenre, providerId, 0.85),
          MetadataDiffBuilder.createFieldDiff('style', undefined, suggestedStyle, providerId, 0.85)
        ]
      };
    });

    const primaryCandidate: WorkflowCandidate = {
      id: candidateId,
      title: candidateTitle,
      artist: candidateArtist,
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
}
