import type { MetadataSource } from '../models/MetadataSource';

export interface IOverwritePolicy {
  canOverwrite(existingSource: MetadataSource, incomingSource: MetadataSource): boolean;
}
