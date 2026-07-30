export type PathResolutionStatus = 'FOUND' | 'MISSING' | 'INVALID_URI';

export interface PathResolutionResult {
  originalReference: string;
  resolvedPath?: string;
  status: PathResolutionStatus;
  diagnostics?: string[];
}
