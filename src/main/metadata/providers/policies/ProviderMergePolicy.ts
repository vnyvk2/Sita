import type { ProviderResult } from '../../models/ProviderResult';

export interface IProviderMergePolicy {
  merge<TDTO = unknown>(results: ProviderResult<TDTO>[]): TDTO | null;
}
