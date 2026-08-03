import type { IMetadataGateway } from '../interfaces/IMetadataGateway';
import { SearchEntityResolver } from './SearchEntityResolver';
import { SearchMetadataHydrator, SearchMatchReference } from './SearchMetadataHydrator';

export class MetadataSearchResolver {
  private readonly hydrator: SearchMetadataHydrator;
  private readonly gateway: IMetadataGateway;

  constructor(gateway: IMetadataGateway) {
    this.gateway = gateway;
    this.hydrator = new SearchMetadataHydrator(gateway);
  }

  public async resolveBatch<TDTO = unknown>(references: SearchMatchReference[]): Promise<TDTO[]> {
    return this.hydrator.hydrateMatches<TDTO>(references);
  }

  public preloadNextPage(references: SearchMatchReference[]): void {
    if (references.length === 0) return;
    const identities = SearchEntityResolver.toMetadataIdentities(references);
    this.gateway.preload(identities);
  }
}
