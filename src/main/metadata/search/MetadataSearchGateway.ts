import type { IMetadataGateway } from '../interfaces/IMetadataGateway';

import { MetadataSearchResolver } from './MetadataSearchResolver';
import { SearchMatchReference } from './SearchMetadataHydrator';

export interface MetadataSearchGatewayOptions {
  gateway: IMetadataGateway;
}

export class MetadataSearchGateway {
  private readonly gateway: IMetadataGateway;
  private readonly resolver: MetadataSearchResolver;

  constructor(options: MetadataSearchGatewayOptions) {
    this.gateway = options.gateway;
    this.resolver = new MetadataSearchResolver(options.gateway);
  }

  public async hydrateSearchResults<TDTO = unknown>(
    references: SearchMatchReference[]
  ): Promise<TDTO[]> {
    return this.resolver.resolveBatch<TDTO>(references);
  }

  public preloadSearchCache(references: SearchMatchReference[]): void {
    this.resolver.preloadNextPage(references);
  }
}
