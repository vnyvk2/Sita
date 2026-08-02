import type { MetadataFieldId } from './MetadataFieldId';
import type { MetadataIdentity } from './MetadataIdentity';
import type { MetadataKind } from './MetadataKind';

import { MetadataSnapshot } from './MetadataSnapshot';
import { MetadataValue } from './MetadataValue';

export interface MetadataEntityOptions {
  identity: MetadataIdentity;
  fields?: Record<MetadataFieldId, MetadataValue<unknown>>;
}

export class MetadataEntity {
  public readonly identity: MetadataIdentity;
  private readonly fieldsMap: Map<MetadataFieldId, MetadataValue<unknown>>;

  constructor(options: MetadataEntityOptions) {
    this.identity = options.identity;
    this.fieldsMap = new Map();

    if (options.fields) {
      for (const [key, value] of Object.entries(options.fields)) {
        this.fieldsMap.set(key, value);
      }
    }
  }

  public get kind(): MetadataKind {
    return this.identity.entityKind;
  }

  public getField<T>(fieldId: MetadataFieldId): MetadataValue<T> | undefined {
    return this.fieldsMap.get(fieldId) as MetadataValue<T> | undefined;
  }

  public setField<T>(fieldId: MetadataFieldId, value: MetadataValue<T>): void {
    this.fieldsMap.set(fieldId, value as MetadataValue<unknown>);
  }

  public hasField(fieldId: MetadataFieldId): boolean {
    return this.fieldsMap.has(fieldId);
  }

  public removeField(fieldId: MetadataFieldId): boolean {
    return this.fieldsMap.delete(fieldId);
  }

  public getAllFields(): Record<MetadataFieldId, MetadataValue<unknown>> {
    const obj: Record<MetadataFieldId, MetadataValue<unknown>> = {};
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
