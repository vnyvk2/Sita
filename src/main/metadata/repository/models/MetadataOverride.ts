import type { MetadataFieldId } from '../../models/MetadataFieldId';

export type MetadataOverrideValue =
  | string
  | number
  | boolean
  | unknown[]
  | Record<string, unknown>;

export interface MetadataOverride {
  id?: number;
  entityKind: string;
  entityId: string;
  fieldId: MetadataFieldId;
  value: MetadataOverrideValue;
  createdAt?: Date;
  updatedAt?: Date;
}
