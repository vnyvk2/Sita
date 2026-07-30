export interface FileSystemAccess {
  exists(filePath: string): Promise<boolean>;
  readFile?(filePath: string): Promise<string>;
}
