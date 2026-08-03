import type { PipelineContext } from './PipelineContext';

export interface IPipelineStage<TDTO = unknown> {
  readonly name: string;
  execute(pipelineContext: PipelineContext<TDTO>): void | Promise<void>;
}
