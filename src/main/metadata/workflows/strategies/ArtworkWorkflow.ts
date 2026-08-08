import type {
  MetadataWorkflow,
  WorkflowCandidate,
  WorkflowMatch,
  WorkflowPreview,
  WorkflowSupportedField,
  WorkflowType
} from '../MetadataWorkflow';
import type { CoverArtArchiveAdapter } from '../../providers/coverartarchive/CoverArtArchiveAdapter';
import type { DiscogsAdapter } from '../../providers/discogs/DiscogsAdapter';
import type { LocalSongInput } from '../../services/AlbumMetadataService';
import type { MetadataProviderId } from '../../models/RecordingMetadata';
import type { ResourceMutationPayload } from '../../domain/MetadataTransaction';

export class ArtworkWorkflow implements MetadataWorkflow {
  public readonly type: WorkflowType = 'artwork';
  public readonly displayName = 'Artwork Auto Tag';

  public readonly supportedFields: WorkflowSupportedField[] = [
    { fieldId: 'artworkUrl', displayName: 'Cover Art', category: 'artwork', defaultEnabled: true }
  ];

  public readonly preferredProviders: MetadataProviderId[] = ['coverartarchive', 'discogs'];

  private readonly caaAdapter: CoverArtArchiveAdapter;
  private readonly discogsAdapter: DiscogsAdapter;

  constructor(caaAdapter: CoverArtArchiveAdapter, discogsAdapter: DiscogsAdapter) {
    this.caaAdapter = caaAdapter;
    this.discogsAdapter = discogsAdapter;
  }

  public async search(
    query: { title?: string; artist?: string; album?: string; limit?: number },
    _signal?: AbortSignal
  ): Promise<WorkflowCandidate[]> {
    const qStr = query.album || query.title || '';
    if (!qStr) return [];

    const candidates: WorkflowCandidate[] = [];

    // Search Discogs for artwork candidates
    const discogsReleases = await this.discogsAdapter.searchAlbums(qStr, query.artist, query.limit ?? 5);
    for (const rel of discogsReleases) {
      const artUrl = rel.artwork?.primaryPath || rel.artwork?.onlineUrls?.[0];
      if (artUrl) {
        candidates.push({
          id: rel.releaseId || rel.title,
          title: rel.title,
          artist: rel.artist,
          album: rel.title,
          coverArtUrl: artUrl,
          provider: 'discogs',
          confidenceScore: 0.85
        });
      }
    }

    return candidates;
  }

  public async buildPreview(
    localSongs: LocalSongInput[],
    candidateId: string,
    providerId: MetadataProviderId = 'discogs',
    _signal?: AbortSignal
  ): Promise<WorkflowPreview> {
    let coverArtUrl: string | undefined;

    if (providerId === 'coverartarchive') {
      const contrib = await this.caaAdapter.fetchContribution({ mbid: candidateId });
      coverArtUrl = contrib?.contributions.find((c) => c.fieldId === 'artworkUrl')?.value as string;
    } else {
      const release = await this.discogsAdapter.resolveRelease(candidateId);
      coverArtUrl = release?.album.artwork?.primaryPath || release?.album.artwork?.onlineUrls?.[0];
    }

    const matches: WorkflowMatch[] = localSongs.map((local) => ({
      localSongId: Number(local.songId),
      songPath: local.path || '',
      matchedCandidateId: candidateId,
      suggestedMetadata: {
        title: local.title,
        artist: local.artist,
        album: local.album,
        artworkUrl: coverArtUrl
      },
      confidence: 0.9,
      fieldDiffs: [
        {
          fieldId: 'artworkUrl',
          oldValue: undefined,
          suggestedValue: coverArtUrl,
          status: coverArtUrl ? 'added' : 'unchanged',
          applyField: Boolean(coverArtUrl),
          providerId
        }
      ]
    }));

    const primaryCandidate: WorkflowCandidate = {
      id: candidateId,
      title: 'Artwork Match',
      coverArtUrl,
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
