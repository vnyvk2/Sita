import type { MetadataValue } from '../models/MetadataValue';

export interface IMergePolicy<T = unknown> {
  merge(values: MetadataValue<T>[]): MetadataValue<T>;
}
