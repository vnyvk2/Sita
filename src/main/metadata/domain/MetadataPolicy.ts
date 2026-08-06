export type PolicyLevel = 'global' | 'operation' | 'field' | 'user';

export interface FieldPolicy {
  fieldId: string;
  preferredProviderId: string;
  fallbackProviderIds?: string[];
}

export interface SelectionPolicy {
  enabledProviderIds: string[];
  maxCandidates: number;
}

export interface MergePolicy {
  providerPriorities: Record<string, number>;
  fieldPolicies?: Record<string, FieldPolicy>;
}

export interface FallbackPolicy {
  allowLocalFallback: boolean;
  allowEmptyFallbacks: boolean;
}

export interface ValidationPolicy {
  strictMode: boolean;
  requireTitle: boolean;
  requireArtist: boolean;
}

export interface MetadataPolicy {
  level: PolicyLevel;
  selection: SelectionPolicy;
  merge: MergePolicy;
  fallback: FallbackPolicy;
  validation: ValidationPolicy;
}
