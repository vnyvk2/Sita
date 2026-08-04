import type { MetadataFieldId } from '../../models/MetadataFieldId';
import type { MetadataKind } from '../../models/MetadataKind';

export type MetadataOverrideValue =
  | string
  | number
  | boolean
  | unknown[]
  | Record<string, unknown>;

export interface MetadataOverride {
  id?: number;
  entityKind: MetadataKind;
  entityId: string;
  fieldId: MetadataFieldId;
  value: MetadataOverrideValue;
  createdAt?: Date;
  updatedAt?: Date;
}
