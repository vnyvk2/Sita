import type { MetadataKind } from './MetadataKind';

export interface MetadataQueryOptions {
  kind: MetadataKind;
  fields?: string[];
  filter?: Record<string, unknown>;
  provider?: string;
  limit?: number;
  offset?: number;
}

export class MetadataQuery {
  public readonly kind: MetadataKind;
  public readonly fields?: string[];
  public readonly filter?: Record<string, unknown>;
  public readonly provider?: string;
  public readonly limit: number;
  public readonly offset: number;

  constructor(options: MetadataQueryOptions) {
    this.kind = options.kind;
    this.fields = options.fields;
    this.filter = options.filter;
    this.provider = options.provider;
    this.limit = options.limit ?? 50;
    this.offset = options.offset ?? 0;
  }
}
