import type { MetadataKind } from '../../models/MetadataKind';

export interface IEntityLoader<TDTO = unknown> {
  readonly kind: MetadataKind;
  load(id: string | number, trx?: DB | DBTransaction): Promise<TDTO | null>;
  loadMany(ids: (string | number)[], trx?: DB | DBTransaction): Promise<TDTO[]>;
}
