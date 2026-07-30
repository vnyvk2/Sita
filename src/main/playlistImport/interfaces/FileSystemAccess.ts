export interface FileSystemAccess {
  exists(filePath: string): Promise<boolean>;
}
