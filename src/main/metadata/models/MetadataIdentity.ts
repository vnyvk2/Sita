import type { MetadataKind } from './MetadataKind';

export interface MetadataIdentityOptions {
  entityKind: MetadataKind;
  entityId: string | number;
  metadataId?: string;
  version?: number;
  fields?: {
    title?: string;
    artist?: string;
    artists?: string[];
    duration?: number;
    album?: string;
    year?: number;
  };
}

export class MetadataIdentity {
  public readonly entityKind: MetadataKind;
  public readonly entityId: string | number;
  public readonly metadataId: string;
  public readonly version: number;
  public readonly fields?: {
    title?: string;
    artist?: string;
    artists?: string[];
    duration?: number;
    album?: string;
    year?: number;
  };

  constructor(options: MetadataIdentityOptions) {
    this.entityKind = options.entityKind;
    this.entityId = options.entityId;
    this.metadataId =
      options.metadataId ?? `${options.entityKind}:${options.entityId}`;
    this.version = options.version ?? 1;
    this.fields = options.fields;
  }

  public getSearchTitle(): string | undefined {
    return this.fields?.title;
  }

  public getSearchArtist(): string | undefined {
    return this.fields?.artist ?? this.fields?.artists?.[0];
  }

  public getSearchDuration(): number | undefined {
    return this.fields?.duration;
  }

  public nextVersion(): MetadataIdentity {
    return new MetadataIdentity({
      entityKind: this.entityKind,
      entityId: this.entityId,
      metadataId: this.metadataId,
      version: this.version + 1,
      fields: this.fields
    });
  }

  public equals(other: MetadataIdentity): boolean {
    return (
      this.entityKind === other.entityKind &&
      String(this.entityId) === String(other.entityId) &&
      this.metadataId === other.metadataId
    );
  }
}
