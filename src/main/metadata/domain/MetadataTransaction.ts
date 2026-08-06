import type { UndoToken } from './UndoToken';

export type TransactionState = 'created' | 'executing' | 'committed' | 'rolledBack' | 'failed';

export interface ResourceMutationPayload {
  resourceId: string | number;
  filePath?: string;
  fieldChanges: Record<string, string | number>;
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
