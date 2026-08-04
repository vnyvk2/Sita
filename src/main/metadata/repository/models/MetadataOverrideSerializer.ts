import type { MetadataFieldId } from '../../models/MetadataFieldId';
import type { MetadataKind } from '../../models/MetadataKind';
import type { MetadataOverride, MetadataOverrideValue } from './MetadataOverride';

export interface DbOverrideRow {
  id?: number;
  entityKind: string;
  entityId: string;
  fieldId: string;
  stringValue?: string | null;
  numberValue?: number | null;
  booleanValue?: boolean | null;
  jsonValue?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class MetadataOverrideSerializer {
  public static serializeValue(val: MetadataOverrideValue): {
    stringValue: string | null;
    numberValue: number | null;
    booleanValue: boolean | null;
    jsonValue: string | null;
  } {
    let stringValue: string | null = null;
    let numberValue: number | null = null;
    let booleanValue: boolean | null = null;
    let jsonValue: string | null = null;

    if (typeof val === 'string') {
      stringValue = val;
    } else if (typeof val === 'number') {
      numberValue = val;
    } else if (typeof val === 'boolean') {
      booleanValue = val;
    } else if (typeof val === 'object' && val !== null) {
      jsonValue = JSON.stringify(val);
    }

    return { stringValue, numberValue, booleanValue, jsonValue };
  }

  public static deserializeRow(row: DbOverrideRow): MetadataOverride {
    let value: MetadataOverrideValue = null as any;

    if (row.stringValue !== null && row.stringValue !== undefined) {
      value = row.stringValue;
    } else if (row.numberValue !== null && row.numberValue !== undefined) {
      value = row.numberValue;
    } else if (row.booleanValue !== null && row.booleanValue !== undefined) {
      value = row.booleanValue;
    } else if (row.jsonValue !== null && row.jsonValue !== undefined) {
      try {
        value = JSON.parse(row.jsonValue);
      } catch {
        value = row.jsonValue;
      }
    }

    return {
      id: row.id,
      entityKind: row.entityKind as MetadataKind,
      entityId: row.entityId,
      fieldId: row.fieldId as MetadataFieldId,
      value,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}
