import type { ProviderResult } from '../../models/ProviderResult';

export interface IMetadataMergePolicy {
  merge<TDTO = unknown>(results: ProviderResult<TDTO>[]): TDTO | null;
}
