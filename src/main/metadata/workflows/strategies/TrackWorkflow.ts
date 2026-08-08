import type {
  MetadataWorkflow,
  WorkflowCandidate,
  WorkflowMatch,
  WorkflowPreview,
  WorkflowSupportedField,
  WorkflowType
} from '../MetadataWorkflow';
import type { MusicBrainzAdapter } from '../../providers/musicbrainz/MusicBrainzAdapter';
import type { LocalSongInput } from '../../services/AlbumMetadataService';
import type { MetadataProviderId } from '../../models/RecordingMetadata';
import type { ResourceMutationPayload } from '../../domain/MetadataTransaction';

export class TrackWorkflow implements MetadataWorkflow {
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
  ): Promise<WorkflowPreview> {
    const recording = await this.mbAdapter.resolveRecording(candidateId);

    const matches: WorkflowMatch[] = localSongs.map((local) => {
      const titleDiffers = local.title !== recording?.title;
      const artistDiffers = local.artist !== recording?.artist;

      return {
        localSongId: Number(local.songId),
        songPath: local.path || '',
        matchedCandidateId: candidateId,
        suggestedMetadata: {
          title: recording?.title ?? local.title,
          artist: recording?.artist ?? local.artist,
          album: local.album,
          trackNumber: recording?.trackNumber ?? local.trackNumber
        },
        confidence: 0.9,
        fieldDiffs: [
          {
            fieldId: 'title',
            oldValue: local.title,
            suggestedValue: recording?.title ?? local.title,
            status: titleDiffers ? 'changed' : 'unchanged',
            applyField: titleDiffers,
            providerId
          },
          {
            fieldId: 'artist',
            oldValue: local.artist,
            suggestedValue: recording?.artist ?? local.artist,
            status: artistDiffers ? 'changed' : 'unchanged',
            applyField: artistDiffers,
            providerId
          }
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
