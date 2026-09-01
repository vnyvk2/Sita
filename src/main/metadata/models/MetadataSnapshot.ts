import type { MetadataIdentity } from './MetadataIdentity';
import type { MetadataValue } from './MetadataValue';

export interface MetadataSnapshotOptions {
  identity: MetadataIdentity;
  fields: Record<string, MetadataValue<unknown>>;
  timestamp?: Date;
}

export class MetadataSnapshot {
  public readonly identity: MetadataIdentity;
  public readonly fields: Readonly<Record<string, MetadataValue<unknown>>>;
  public readonly timestamp: Date;

  constructor(options: MetadataSnapshotOptions) {
    this.identity = options.identity;
    this.fields = Object.freeze({ ...options.fields });
    this.timestamp = options.timestamp ?? new Date();
    Object.freeze(this);
  }

  public freeze(): MetadataSnapshot {
    return this;
  }

  public clone(): MetadataSnapshot {
    return new MetadataSnapshot({
      identity: this.identity,
      fields: { ...this.fields },
      timestamp: new Date()
    });
  }

  public diff(
    other: MetadataSnapshot
  ): Record<
    string,
    { current: MetadataValue<unknown> | null; other: MetadataValue<unknown> | null }
  > {
    const diffs: Record<
      string,
      { current: MetadataValue<unknown> | null; other: MetadataValue<unknown> | null }
    > = {};
    const keys = new Set([...Object.keys(this.fields), ...Object.keys(other.fields)]);

    for (const key of keys) {
      const selfVal = this.fields[key] ?? null;
      const otherVal = other.fields[key] ?? null;

      if (!this.areValuesEqual(selfVal?.value, otherVal?.value)) {
        diffs[key] = { current: selfVal, other: otherVal };
      }
    }

    return diffs;
  }

  private areValuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((val, index) => this.areValuesEqual(val, b[index]));
    }
    if (typeof a === 'object' && typeof b === 'object') {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
  }
}
