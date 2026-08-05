export interface ProviderIdentity {
  id: string;
  name: string;
  version: string;
  providerType: 'embedded' | 'user-override' | 'online' | 'plugin';
  homepage?: string;
  description?: string;
}
