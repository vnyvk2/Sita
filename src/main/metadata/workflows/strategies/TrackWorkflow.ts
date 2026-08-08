import type {
  WorkflowCandidate,
  WorkflowMatch,
  MetadataPreview,
  WorkflowSupportedField,
  WorkflowType
} from '../MetadataWorkflow';
import { BaseMetadataWorkflow } from '../MetadataWorkflow';
import type { MusicBrainzAdapter } from '../../providers/musicbrainz/MusicBrainzAdapter';
import type { LocalSongInput } from '../../services/AlbumMetadataService';
import type { MetadataProviderId } from '../../models/RecordingMetadata';
import { MetadataDiffBuilder } from '../../diff/MetadataDiffBuilder';

export class TrackWorkflow extends BaseMetadataWorkflow {
  public readonly type: WorkflowType = 'track';
  public readonly displayName = 'Track Auto Tag';

  public readonly supportedFields: WorkflowSupportedField[] = [
    { fieldId: 'title', displayName: 'Title', category: 'core', defaultEnabled: true },
    { fieldId: 'artist', displayName: 'Artist', category: 'core', defaultEnabled: true },
    { fieldId: 'trackNumber', displayName: 'Track #', category: 'core', defaultEnabled: true }
  ];

  public readonly preferredProviders: MetadataProviderId[] = ['musicbrainz'];

  private readonly mbAdapter: MusicBrainzAdapter;

  constructor(mbAdapter: MusicBrainzAdapter) {
    super();
    this.mbAdapter = mbAdapter;
  }

  public async search(
    query: { title?: string; artist?: string; album?: string; limit?: number },
    _signal?: AbortSignal
  ): Promise<WorkflowCandidate[]> {
    const title = query.title || '';
    if (!title) return [];

    const recordings = await this.mbAdapter.searchRecordings(title, query.artist, query.limit ?? 10);

    return recordings.map((rec) => ({
      id: rec.id,
      title: rec.title,
      artist: rec.artist,
      album: rec.album,
      year: rec.year,
      provider: 'musicbrainz',
      confidenceScore: rec.confidenceScore
    }));
  }

  public async buildPreview(
    localSongs: LocalSongInput[],
    candidateId: string,
    providerId: MetadataProviderId = 'musicbrainz',
    _signal?: AbortSignal
  ): Promise<MetadataPreview> {
    const recording = await this.mbAdapter.resolveRecording(candidateId);

    const matches: WorkflowMatch[] = localSongs.map((local) => {
      const suggestedTitle = recording?.title ?? local.title;
      const suggestedArtist = recording?.artist ?? local.artist;

      return {
        localSongId: Number(local.songId),
        songPath: local.path || '',
        matchedCandidateId: candidateId,
        suggestedMetadata: {
          title: suggestedTitle,
          artist: suggestedArtist,
          album: local.album,
          trackNumber: recording?.trackNumber ?? local.trackNumber
        },
        confidence: 0.9,
        fieldDiffs: [
          MetadataDiffBuilder.createFieldDiff('title', local.title, suggestedTitle, providerId, 0.9),
          MetadataDiffBuilder.createFieldDiff('artist', local.artist, suggestedArtist, providerId, 0.9)
        ]
      };
    });

    const primaryCandidate: WorkflowCandidate = {
      id: candidateId,
      title: recording?.title ?? 'Unknown Recording',
      artist: recording?.artist ?? 'Unknown Artist',
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
