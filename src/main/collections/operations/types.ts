export type OperationReverseData =
  | { type: 'entries_snapshot'; entries: Array<{ songId: number; position: number }> }
  | { type: 'name_snapshot'; previousName: string }
  | { type: 'full_snapshot'; data: Record<string, unknown> };

export interface CollectionOperation {
  collectionId: string;
  operationType: string;
  input: Record<string, unknown>;
}

export interface OperationResult {
  success: boolean;
  error?: Error;
}

export interface JournalEntry {
  id: number;
  collectionType: string;
  collectionId: number;
  operationType: string;
  direction: 'forward' | 'reverse';
  operationInput: Record<string, unknown>;
  reverseData: OperationReverseData;
  sequenceNumber: number;
  expiresAt: Date | null;
  createdAt: Date;
}
