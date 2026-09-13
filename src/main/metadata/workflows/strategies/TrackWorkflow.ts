import { MetadataDiffBuilder } from '../../diff/MetadataDiffBuilder';
import type { MetadataProviderId } from '../../models/RecordingMetadata';
import type { CoverArtArchiveAdapter } from '../../providers/coverartarchive/CoverArtArchiveAdapter';
import type { MusicBrainzAdapter } from '../../providers/musicbrainz/MusicBrainzAdapter';
import type { LocalSongInput } from '../../services/AlbumMetadataService';
import type {
  WorkflowCandidate,
  WorkflowMatch,
  MetadataPreview,
  WorkflowSupportedField,
  WorkflowType
} from '../MetadataWorkflow';
import { BaseMetadataWorkflow } from '../MetadataWorkflow';

export class TrackWorkflow extends BaseMetadataWorkflow {
  public readonly type: WorkflowType = 'track';
  public readonly displayName = 'Track Auto Tag';

  public readonly supportedFields: WorkflowSupportedField[] = [
    { fieldId: 'title', displayName: 'Title', category: 'core', defaultEnabled: true },
    { fieldId: 'artist', displayName: 'Artist', category: 'core', defaultEnabled: true },
    { fieldId: 'trackNumber', displayName: 'Track #', category: 'core', defaultEnabled: true },
    { fieldId: 'artworkUrl', displayName: 'Cover Art', category: 'artwork', defaultEnabled: true }
  ];

  public readonly preferredProviders: MetadataProviderId[] = ['musicbrainz'];

  private readonly mbAdapter: MusicBrainzAdapter;
  private readonly caaAdapter?: CoverArtArchiveAdapter;

  constructor(mbAdapter: MusicBrainzAdapter, caaAdapter?: CoverArtArchiveAdapter) {
    super();
    this.mbAdapter = mbAdapter;
    this.caaAdapter = caaAdapter;
  }

  public async search(
    query: { title?: string; artist?: string; album?: string; limit?: number },
    _signal?: AbortSignal
  ): Promise<WorkflowCandidate[]> {
    const title = query.title || '';
    if (!title) return [];

    const recordings = await this.mbAdapter.searchRecordings(
      title,
      query.artist,
      query.limit ?? 10
    );

    return recordings.map((rec) => ({
      id: rec.id,
      title: rec.title,
      artist: rec.artist,
      album: rec.album,
      year: rec.year,
      provider: 'musicbrainz',
      confidenceScore: rec.confidenceScore,
      rawItem: { releaseId: rec.releaseId, releaseGroupId: rec.releaseGroupId }
    }));
  }

  public async buildPreview(
    localSongs: LocalSongInput[],
    candidateId: string,
    providerId: MetadataProviderId = 'musicbrainz',
    _signal?: AbortSignal
  ): Promise<MetadataPreview> {
    const recording = await this.mbAdapter.resolveRecording(candidateId);

    let coverArtUrl: string | undefined;
    if (this.caaAdapter && (recording?.releaseId || recording?.releaseGroupId)) {
      try {
        const contrib = await this.caaAdapter.fetchContribution({
          mbid: recording.releaseId,
          releaseGroupId: recording.releaseGroupId
        });
        coverArtUrl = contrib?.contributions.find(
          (c) => c.fieldId === 'artworkUrl' || c.fieldId === 'artworkPath'
        )?.value as string | undefined;
      } catch {
        // Fallback gracefully without artwork if CAA lookup fails
      }
    }

    const matches: WorkflowMatch[] = localSongs.map((local) => {
      const suggestedTitle = recording?.title ?? local.title;
      const suggestedArtist = recording?.artist ?? local.artist;
      const suggestedTrackNumber = recording?.trackNumber ?? local.trackNumber;

      const fieldDiffs = [
        MetadataDiffBuilder.createFieldDiff({
          fieldId: 'title',
          oldVal: local.title,
          newVal: suggestedTitle,
          providerId,
          confidenceScore: 0.9
        }),
        MetadataDiffBuilder.createFieldDiff({
          fieldId: 'artist',
          oldVal: local.artist,
          newVal: suggestedArtist,
          providerId,
          confidenceScore: 0.9
        })
      ];

      if (suggestedTrackNumber !== undefined) {
        fieldDiffs.push(
          MetadataDiffBuilder.createFieldDiff({
            fieldId: 'trackNumber',
            oldVal: local.trackNumber,
            newVal: suggestedTrackNumber,
            providerId,
            confidenceScore: 0.9
          })
        );
      }

      if (coverArtUrl) {
        fieldDiffs.push(
          MetadataDiffBuilder.createFieldDiff({
            fieldId: 'artworkUrl',
            oldVal: local.artworkPath,
            newVal: coverArtUrl,
            providerId,
            confidenceScore: 0.9
          })
        );
      }

      return {
        localSongId: Number(local.songId),
        songPath: local.path || '',
        matchedCandidateId: candidateId,
        suggestedMetadata: {
          title: suggestedTitle,
          artist: suggestedArtist,
          album: recording?.album ?? local.album,
          trackNumber: suggestedTrackNumber,
          artworkUrl: coverArtUrl
        },
        confidence: 0.9,
        fieldDiffs
      };
    });

    const primaryCandidate: WorkflowCandidate = {
      id: candidateId,
      title: recording?.title ?? 'Unknown Recording',
      artist: recording?.artist ?? 'Unknown Artist',
      album: recording?.album,
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
}
