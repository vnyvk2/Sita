import type { MetadataValue } from '../models/MetadataValue';
import type { IMergePolicy } from './MergePolicy';

export class DefaultMergePolicy<T = unknown> implements IMergePolicy<T> {
  public merge(values: MetadataValue<T>[]): MetadataValue<T> {
    if (values.length === 0) {
      throw new Error('Cannot merge empty array of MetadataValues');
    }

    // Sort by confidence score descending, then source priority descending
    const sorted = [...values].sort((a, b) => {
      if (b.confidence.score !== a.confidence.score) {
        return b.confidence.score - a.confidence.score;
      }
      return b.source.priority - a.source.priority;
    });

    return sorted[0];
  }
}
