import type { ProviderResult } from '../../models/ProviderResult';
import type { ProviderExecutionStageContext } from './ProviderExecutionStageContext';

export interface IProviderExecutionStage {
  readonly name: string;
  execute<TDTO = unknown>(
    context: ProviderExecutionStageContext<TDTO>,
    next: () => Promise<ProviderResult<TDTO>>
  ): Promise<ProviderResult<TDTO>>;
}
