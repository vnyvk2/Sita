import type { SearchMatchReference } from '@main/search/models/SearchMatchReference';

import type { IMetadataGateway } from '../interfaces/IMetadataGateway';
import { MetadataSearchResultMapper } from './MetadataSearchResultMapper';
import { SearchEntityResolver } from './SearchEntityResolver';

export class SearchMetadataHydrator {
  private readonly gateway: IMetadataGateway;

  constructor(gateway: IMetadataGateway) {
    this.gateway = gateway;
  }

  public async hydrateMatches<TDTO = unknown>(references: SearchMatchReference[]): Promise<TDTO[]> {
    if (references.length === 0) return [];

    const identities = SearchEntityResolver.toMetadataIdentities(references);
    const entities = await this.gateway.loadMany(identities);

    // If there are remaining matches past top 50, trigger background preloading (51-100)
    if (identities.length > 50) {
      const preloadIdentities = identities.slice(50, 100);
      this.gateway.preload(preloadIdentities);
    }

    return MetadataSearchResultMapper.mapEntitiesToDTOs<TDTO>(entities);
  }
}
