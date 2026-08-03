import type { FieldId } from './MetadataFieldId';
import type { MetadataIdentity } from './MetadataIdentity';
import type { MetadataKind } from './MetadataKind';

import { MetadataSnapshot } from './MetadataSnapshot';
import { MetadataValue } from './MetadataValue';

export interface MetadataEntityOptions {
  identity: MetadataIdentity;
  fields?: Map<FieldId, MetadataValue<unknown>> | Record<FieldId, MetadataValue<unknown>>;
  rawPayload?: unknown;
}

export class MetadataEntity {
  public readonly identity: MetadataIdentity;
  public readonly rawPayload?: unknown;
  private readonly fieldsMap: Map<FieldId, MetadataValue<unknown>>;

  constructor(options: MetadataEntityOptions) {
    this.identity = options.identity;
    this.rawPayload = options.rawPayload;
    this.fieldsMap = new Map();

    if (options.fields) {
      if (options.fields instanceof Map) {
        for (const [key, value] of options.fields.entries()) {
          this.fieldsMap.set(key, value);
        }
      } else {
        for (const [key, value] of Object.entries(options.fields)) {
          this.fieldsMap.set(key, value);
        }
      }
    }
  }

  public get kind(): MetadataKind {
    return this.identity.entityKind;
  }

  public getField<T>(fieldId: FieldId): MetadataValue<T> | undefined {
    return this.fieldsMap.get(fieldId) as MetadataValue<T> | undefined;
  }

  public setField<T>(fieldId: FieldId, value: MetadataValue<T>): void {
    this.fieldsMap.set(fieldId, value as MetadataValue<unknown>);
  }

  public hasField(fieldId: FieldId): boolean {
    return this.fieldsMap.has(fieldId);
  }

  public getAllFields(): Record<string, MetadataValue<unknown>> {
    const result: Record<string, MetadataValue<unknown>> = {};
    for (const [key, value] of this.fieldsMap.entries()) {
      result[key] = value;
    }
    return result;
  }

  public createSnapshot(): MetadataSnapshot {
    return new MetadataSnapshot({
      identity: this.identity,
      fields: this.getAllFields()
    });
  }
}
