import type { MetadataProviderId } from '../models/RecordingMetadata';
import type { LocalSongInput } from '../services/AlbumMetadataService';
import type { ResourceMutationPayload } from '../domain/MetadataTransaction';

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
  rawItem?: unknown;
}

export interface WorkflowFieldDiff {
  fieldId: string;
  oldValue?: string | number;
  suggestedValue?: string | number;
  userValue?: string | number;
  status: 'unchanged' | 'changed' | 'added' | 'removed';
  applyField: boolean;
  providerId?: MetadataProviderId;
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
  fieldDiffs: WorkflowFieldDiff[];
}

export interface WorkflowPreview {
  workflowType: WorkflowType;
  primaryCandidate?: WorkflowCandidate;
  candidates: WorkflowCandidate[];
  matches: WorkflowMatch[];
  supportedFields: WorkflowSupportedField[];
  provider: MetadataProviderId;
}

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
  ): Promise<WorkflowPreview>;

  buildMutations(
    preview: WorkflowPreview,
    selectedFieldIds?: string[]
  ): ResourceMutationPayload[];
}
