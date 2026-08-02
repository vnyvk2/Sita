import type { FieldId } from './MetadataFieldId';
import type { MetadataIdentity } from './MetadataIdentity';
import type { MetadataKind } from './MetadataKind';

import { MetadataSnapshot } from './MetadataSnapshot';
import { MetadataValue } from './MetadataValue';

export interface MetadataEntityOptions {
  identity: MetadataIdentity;
  fields?: Map<FieldId, MetadataValue<unknown>> | Record<FieldId, MetadataValue<unknown>>;
}

export class MetadataEntity {
  public readonly identity: MetadataIdentity;
  private readonly fieldsMap: Map<FieldId, MetadataValue<unknown>>;

  constructor(options: MetadataEntityOptions) {
    this.identity = options.identity;
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

  public removeField(fieldId: FieldId): boolean {
    return this.fieldsMap.delete(fieldId);
  }

  public getFieldsMap(): Map<FieldId, MetadataValue<unknown>> {
    return new Map(this.fieldsMap);
  }

  public getAllFields(): Record<FieldId, MetadataValue<unknown>> {
    const obj: Record<FieldId, MetadataValue<unknown>> = {};
    for (const [key, val] of this.fieldsMap.entries()) {
      obj[key] = val;
    }
    return obj;
  }

  public createSnapshot(): MetadataSnapshot {
    return new MetadataSnapshot({
      identity: this.identity,
      fields: this.getAllFields()
    });
  }
}
