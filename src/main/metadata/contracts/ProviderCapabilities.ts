export enum ProviderCapability {
  Lookup = 'Lookup',
  Search = 'Search',
  Enrichment = 'Enrichment',
  Artwork = 'Artwork',
  Relationships = 'Relationships',
  Language = 'Language',
  Lyrics = 'Lyrics',
  Tags = 'Tags',
  Fingerprint = 'Fingerprint',
  Recommendations = 'Recommendations'
}

export class ProviderCapabilities {
  private readonly capabilities: Set<ProviderCapability>;

  constructor(capabilities: ProviderCapability[] = []) {
    this.capabilities = new Set(capabilities);
  }

  public has(capability: ProviderCapability): boolean {
    return this.capabilities.has(capability);
  }

  public add(capability: ProviderCapability): this {
    this.capabilities.add(capability);
    return this;
  }

  public remove(capability: ProviderCapability): this {
    this.capabilities.delete(capability);
    return this;
  }

  public getAll(): ProviderCapability[] {
    return Array.from(this.capabilities);
  }
}
