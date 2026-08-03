import type { MetadataEntity } from '../models/MetadataEntity';
import type { MetadataKind } from '../models/MetadataKind';

export interface IMetadataMapper<TDTO = unknown> {
  readonly kind: MetadataKind;
  map(dto: TDTO): MetadataEntity;
}
