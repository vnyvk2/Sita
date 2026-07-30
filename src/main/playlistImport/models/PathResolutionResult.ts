export type PathResolutionStatus = 'RESOLVED' | 'UNRESOLVED' | 'INVALID_URI';
export type FilesystemVerificationStatus = 'FOUND' | 'MISSING' | 'UNVERIFIED';

export interface PathResolutionResult {
  originalReference: string;
  resolvedPath?: string;
  resolutionStatus: PathResolutionStatus;
  verificationStatus: FilesystemVerificationStatus;
  diagnostics?: string[];
}
