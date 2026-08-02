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
  private isFrozen: boolean = false;

  constructor(options: MetadataSnapshotOptions) {
    this.identity = options.identity;
    this.fields = Object.freeze({ ...options.fields });
    this.timestamp = options.timestamp ?? new Date();
  }

  public freeze(): MetadataSnapshot {
    const clone = this.clone();
    (clone as { isFrozen: boolean }).isFrozen = true;
    return clone;
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
  ): Record<string, { current: MetadataValue<unknown> | null; other: MetadataValue<unknown> | null }> {
    const diffs: Record<
      string,
      { current: MetadataValue<unknown> | null; other: MetadataValue<unknown> | null }
    > = {};
    const keys = new Set([...Object.keys(this.fields), ...Object.keys(other.fields)]);

    for (const key of keys) {
      const selfVal = this.fields[key] ?? null;
      const otherVal = other.fields[key] ?? null;

      if (JSON.stringify(selfVal?.value) !== JSON.stringify(otherVal?.value)) {
        diffs[key] = { current: selfVal, other: otherVal };
      }
    }

    return diffs;
  }
}
