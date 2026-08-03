import type { MetadataConfidence } from './MetadataConfidence';
import type { MetadataProviderInfo } from './MetadataProviderInfo';
import type { ProviderResultStatus } from './ProviderResultStatus';

export interface ProviderResultOptions<TPayload = unknown> {
  payload: TPayload | null;
  confidence: MetadataConfidence;
  providerInfo: MetadataProviderInfo;
  latencyMs?: number;
  status?: ProviderResultStatus;
  diagnostics?: Record<string, unknown>;
  error?: string;
}

export class ProviderResult<TPayload = unknown> {
  public readonly payload: TPayload | null;
  public readonly confidence: MetadataConfidence;
  public readonly providerInfo: MetadataProviderInfo;
  public readonly latencyMs: number;
  public readonly status: ProviderResultStatus;
  public readonly diagnostics?: Record<string, unknown>;
  public readonly error?: string;

  constructor(options: ProviderResultOptions<TPayload>) {
    this.payload = options.payload;
    this.confidence = options.confidence;
    this.providerInfo = options.providerInfo;
    this.latencyMs = options.latencyMs ?? 0;
    this.status = options.status ?? 'success';
    this.diagnostics = options.diagnostics;
    this.error = options.error;
  }
}
