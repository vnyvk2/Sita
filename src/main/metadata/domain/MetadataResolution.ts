import type { ProviderAttribution } from './ProviderAttribution';

export type ProviderId = string;

export interface ProviderCandidate {
  providerId: ProviderId;
  providerName: string;
  externalId: string;
  title: string;
  artist?: string;
  album?: string;
  year?: number;
  score: number; // 0 to 1
  matchedAttributes: Record<string, string | number>;
}

export interface ResolvedResource {
  resourceId: string | number;
  resourceType: string;
  mergedFields: Record<string, string | number>;
  attributions: Record<string, ProviderAttribution>;
  overallConfidence: number;
}

export interface MetadataResolution {
  operationId: string;
  resourceId: string | number;
  candidates: ProviderCandidate[];
  resolvedResource?: ResolvedResource;
  resolvedAt: number;
}
