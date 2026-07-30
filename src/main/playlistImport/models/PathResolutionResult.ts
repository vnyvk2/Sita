export type PathResolutionStatus = 'RESOLVED' | 'UNRESOLVED' | 'MISSING' | 'INVALID_URI';

export interface PathResolutionResult {
  originalReference: string;
  resolvedPath?: string;
  status: PathResolutionStatus;
  diagnostics?: string[];
}
