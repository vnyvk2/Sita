import type { MetadataResourceType } from './MetadataResource';
import type { ExecutionMode } from './MetadataOperation';
import type { MetadataPolicy } from './MetadataPolicy';

export interface TargetResourceReference {
  resourceId: string | number;
  resourceType: MetadataResourceType;
  filePath?: string;
}

export interface MetadataContext {
  resourceType: MetadataResourceType;
  targetResources: TargetResourceReference[];
  query?: Record<string, string | number>;
  policy?: MetadataPolicy;
  executionMode: ExecutionMode;
  userSelections?: Record<string, string | number>;
}
