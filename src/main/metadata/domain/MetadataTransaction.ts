import type { UndoToken } from './UndoToken';
import type { ProviderId } from './MetadataResolution';

export type TransactionState = 'created' | 'executing' | 'committed' | 'rolledBack' | 'failed';

export interface FieldMutation {
  fieldId: string;
  oldValue?: string | number;
  newValue?: string | number;
  providerId?: ProviderId;
  confidenceScore?: number;
}

export interface ResourceMutationPayload {
  resourceId: string | number;
  filePath?: string;
  fieldMutations: FieldMutation[];
  artworkBuffer?: Buffer;
}

export interface MetadataTransaction {
  id: string;
  operationId: string;
  createdAt: number;
  state: TransactionState;
  mutations: ResourceMutationPayload[];
  undoToken?: UndoToken;
}
