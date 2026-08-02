import type { MetadataValue } from '../models/MetadataValue';

export interface ConflictResolutionContext {
  fieldId: string;
  existingValue: MetadataValue<unknown>;
  incomingValue: MetadataValue<unknown>;
}

export interface IConflictPolicy {
  resolve(context: ConflictResolutionContext): MetadataValue<unknown>;
}
