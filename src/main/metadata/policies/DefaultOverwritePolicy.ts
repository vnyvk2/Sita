import type { MetadataSource } from '../models/MetadataSource';
import type { IOverwritePolicy } from './OverwritePolicy';

export class DefaultOverwritePolicy implements IOverwritePolicy {
  public canOverwrite(existingSource: MetadataSource, incomingSource: MetadataSource): boolean {
    return incomingSource.priority >= existingSource.priority;
  }
}
