import type { MetadataValue } from '../models/MetadataValue';
import type { ConflictResolutionContext, IConflictPolicy } from './ConflictPolicy';

export class DefaultConflictPolicy implements IConflictPolicy {
  public resolve(context: ConflictResolutionContext): MetadataValue<unknown> {
    const { existingValue, incomingValue } = context;

    // Highest confidence wins
    if (incomingValue.confidence.score > existingValue.confidence.score) {
      return incomingValue;
    }
    if (existingValue.confidence.score > incomingValue.confidence.score) {
      return existingValue;
    }

    // Source priority weighting fallback
    if (incomingValue.source.priority > existingValue.source.priority) {
      return incomingValue;
    }
    if (existingValue.source.priority > incomingValue.source.priority) {
      return existingValue;
    }

    // Most recent update timestamp fallback
    return incomingValue.updatedAt >= existingValue.updatedAt ? incomingValue : existingValue;
  }
}
