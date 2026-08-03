export interface MetadataContextOptions {
  clock?: () => Date;
  logger?: {
    debug(msg: string, meta?: unknown): void;
    info(msg: string, meta?: unknown): void;
    warn(msg: string, meta?: unknown): void;
    error(msg: string, meta?: unknown): void;
  };
  locale?: string;
  cancellationToken?: { isCancelled: boolean };
  transaction?: unknown;
  traceId?: string;
}

export class MetadataContext {
  public readonly clock: () => Date;
  public readonly logger: Required<MetadataContextOptions>['logger'];
  public readonly locale: string;
  public readonly cancellationToken?: { isCancelled: boolean };
  public readonly transaction?: unknown;
  public readonly traceId?: string;

  constructor(options: MetadataContextOptions = {}) {
    this.clock = options.clock ?? (() => new Date());
    this.logger = options.logger ?? {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {}
    };
    this.locale = options.locale ?? 'en-US';
    this.cancellationToken = options.cancellationToken;
    this.transaction = options.transaction;
    this.traceId = options.traceId ?? `trace-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }
}
