import { MetadataDiffBuilder } from '../../diff/MetadataDiffBuilder';
import type { MetadataProviderId } from '../../models/RecordingMetadata';
import type { DiscogsAdapter } from '../../providers/discogs/DiscogsAdapter';
import type { LocalSongInput } from '../../services/AlbumMetadataService';
import type {
  WorkflowCandidate,
  WorkflowMatch,
  MetadataPreview,
  WorkflowSupportedField,
  WorkflowType
} from '../MetadataWorkflow';
import { BaseMetadataWorkflow } from '../MetadataWorkflow';

export class GenreWorkflow extends BaseMetadataWorkflow {
  public readonly type: WorkflowType = 'genre';
  public readonly displayName = 'Genre & Style Auto Tag';

  public readonly supportedFields: WorkflowSupportedField[] = [
    { fieldId: 'genre', displayName: 'Genre', category: 'genre_style', defaultEnabled: true },
    { fieldId: 'style', displayName: 'Style', category: 'genre_style', defaultEnabled: true }
  ];

  public readonly preferredProviders: MetadataProviderId[] = ['discogs'];

  private readonly discogsAdapter: DiscogsAdapter;
  private readonly candidateCache: Map<string, WorkflowCandidate> = new Map();
  private static readonly MAX_CACHE_SIZE = 100;

  constructor(discogsAdapter: DiscogsAdapter) {
    super();
    this.discogsAdapter = discogsAdapter;
  }

  private cacheCandidate(candidateId: string, candidate: WorkflowCandidate): void {
    if (this.candidateCache.size >= GenreWorkflow.MAX_CACHE_SIZE) {
      const oldestKey = this.candidateCache.keys().next().value;
      if (oldestKey) this.candidateCache.delete(oldestKey);
    }
    this.candidateCache.set(candidateId, candidate);
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

      const genreVal = contrib?.contributions.find((c) => c.fieldId === 'genre')?.value as
        | string
        | undefined;
      const styleVal = contrib?.contributions.find((c) => c.fieldId === 'style')?.value as
        | string
        | undefined;

      const candidateId = alb.releaseId || alb.title;
      const candidate: WorkflowCandidate = {
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
      };

      this.cacheCandidate(candidateId, candidate);
      candidates.push(candidate);
    }

    return candidates;
  }

  public async buildPreview(
    localSongs: LocalSongInput[],
    candidateId: string,
    providerId: MetadataProviderId = 'discogs',
    _signal?: AbortSignal
  ): Promise<MetadataPreview> {
    // 1. Cache hit: use full WorkflowCandidate object from search cache to eliminate network call
    let genreVal: string | undefined;
    let styleVal: string | undefined;
    let candidateTitle = 'Unknown Release';
    let candidateArtist = 'Unknown Artist';

    const cachedCandidate = this.candidateCache.get(candidateId);
    if (cachedCandidate) {
      genreVal = cachedCandidate.genre;
      styleVal = cachedCandidate.style;
      candidateTitle = cachedCandidate.title;
      candidateArtist = cachedCandidate.artist ?? candidateArtist;
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
          genreVal = contrib.contributions.find((c) => c.fieldId === 'genre')?.value as
            | string
            | undefined;
          styleVal = contrib.contributions.find((c) => c.fieldId === 'style')?.value as
            | string
            | undefined;
        }

        const candidate: WorkflowCandidate = {
          id: candidateId,
          title: candidateTitle,
          artist: candidateArtist,
          album: candidateTitle,
          year: release.album.year,
          genre: genreVal,
          style: styleVal,
          coverArtUrl: release.album.artwork?.primaryPath || release.album.artwork?.onlineUrls?.[0],
          provider: 'discogs',
          confidenceScore: 0.85,
          rawItem: { album: release.album, contrib }
        };
        this.cacheCandidate(candidateId, candidate);
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
          MetadataDiffBuilder.createFieldDiff({
            fieldId: 'genre',
            oldVal: local.genre,
            newVal: suggestedGenre,
            providerId,
            confidenceScore: 0.85
          }),
          MetadataDiffBuilder.createFieldDiff({
            fieldId: 'style',
            oldVal: undefined,
            newVal: suggestedStyle,
            providerId,
            confidenceScore: 0.85
          })
        ]
      };
    });

    const primaryCandidate: WorkflowCandidate = cachedCandidate ?? {
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
