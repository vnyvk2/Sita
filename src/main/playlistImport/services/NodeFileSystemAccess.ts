import { stat } from 'fs/promises';
import type { FileSystemAccess } from '../interfaces/FileSystemAccess';

export class NodeFileSystemAccess implements FileSystemAccess {
  async exists(filePath: string): Promise<boolean> {
    try {
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
