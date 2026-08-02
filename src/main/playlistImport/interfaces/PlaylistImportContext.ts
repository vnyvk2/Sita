export interface PlaylistImportContext {
  filePath: string;
  content: string;
  options?: Record<string, unknown>;
  signal?: AbortSignal;
}
