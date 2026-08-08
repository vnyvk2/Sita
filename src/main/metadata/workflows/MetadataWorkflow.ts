import type { MetadataProviderId } from '../models/RecordingMetadata';
import type { LocalSongInput } from '../services/AlbumMetadataService';
import type { ResourceMutationPayload } from '../domain/MetadataTransaction';
import type { MetadataFieldDiff } from '@common/metadata/types';

export type WorkflowType = 'album' | 'track' | 'genre' | 'artwork';

export interface WorkflowSupportedField {
  fieldId: string;
  displayName: string;
  category: 'core' | 'genre_style' | 'artwork' | 'extended';
  defaultEnabled: boolean;
}

export interface WorkflowCandidate {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  year?: number;
  genre?: string;
  style?: string;
  coverArtUrl?: string;
  provider: MetadataProviderId;
  confidenceScore?: number;
  metadata?: Record<string, unknown>;
  rawItem?: unknown;
}

export interface WorkflowMatch {
  localSongId: number;
  songPath: string;
  matchedCandidateId?: string;
  suggestedMetadata?: {
    title?: string;
    artist?: string;
    album?: string;
    year?: number;
    genre?: string;
    style?: string;
    artworkUrl?: string;
    trackNumber?: number;
  };
  confidence: number;
  fieldDiffs: MetadataFieldDiff[];
}

export interface MetadataPreview {
  workflowType: WorkflowType;
  primaryCandidate?: WorkflowCandidate;
  candidates: WorkflowCandidate[];
  matches: WorkflowMatch[];
  supportedFields: WorkflowSupportedField[];
  provider: MetadataProviderId;
  warnings?: string[];
  overallConfidence?: number;
}

export type WorkflowPreview = MetadataPreview;

export interface MetadataWorkflow {
  readonly type: WorkflowType;
  readonly displayName: string;
  readonly supportedFields: WorkflowSupportedField[];
  readonly preferredProviders: MetadataProviderId[];

  search(
    query: { title?: string; artist?: string; album?: string; limit?: number },
    signal?: AbortSignal
  ): Promise<WorkflowCandidate[]>;

  buildPreview(
    localSongs: LocalSongInput[],
    candidateId: string,
    providerId?: MetadataProviderId,
    signal?: AbortSignal
  ): Promise<MetadataPreview>;

  buildMutations(
    preview: MetadataPreview,
    selectedFieldIds?: string[]
  ): ResourceMutationPayload[];
}

export abstract class BaseMetadataWorkflow implements MetadataWorkflow {
  public abstract readonly type: WorkflowType;
  public abstract readonly displayName: string;
  public abstract readonly supportedFields: WorkflowSupportedField[];
  public abstract readonly preferredProviders: MetadataProviderId[];

  public abstract search(
    query: { title?: string; artist?: string; album?: string; limit?: number },
    signal?: AbortSignal
  ): Promise<WorkflowCandidate[]>;

  public abstract buildPreview(
    localSongs: LocalSongInput[],
    candidateId: string,
    providerId?: MetadataProviderId,
    signal?: AbortSignal
  ): Promise<MetadataPreview>;

  public buildMutations(
    preview: MetadataPreview,
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
