import type { MetadataKind } from './MetadataKind';

export interface MetadataIdentityOptions {
  entityKind: MetadataKind;
  entityId: string | number;
  metadataId?: string;
  version?: number;
}

export class MetadataIdentity {
  public readonly entityKind: MetadataKind;
  public readonly entityId: string | number;
  public readonly metadataId: string;
  public readonly version: number;

  constructor(options: MetadataIdentityOptions) {
    this.entityKind = options.entityKind;
    this.entityId = options.entityId;
    this.metadataId =
      options.metadataId ?? `${options.entityKind}:${options.entityId}`;
    this.version = options.version ?? 1;
  }

  public nextVersion(): MetadataIdentity {
    return new MetadataIdentity({
      entityKind: this.entityKind,
      entityId: this.entityId,
      metadataId: this.metadataId,
      version: this.version + 1
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
