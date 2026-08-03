import type { MetadataContext } from './MetadataContext';

export interface CancellationToken {
  readonly isCancelled: boolean;
  isCancellationRequested?(): boolean;
}

export interface ProviderExecutionContextOptions {
  timeoutMs?: number;
  cancellationToken?: CancellationToken;
  traceId?: string;
  context?: MetadataContext;
}

export class ProviderExecutionContext {
  public readonly timeoutMs: number;
  public readonly cancellationToken?: CancellationToken;
  public readonly traceId?: string;
  public readonly context?: MetadataContext;

  constructor(options: ProviderExecutionContextOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.cancellationToken = options.cancellationToken;
    this.traceId = options.traceId ?? options.context?.traceId;
    this.context = options.context;
  }
}
