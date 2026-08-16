import path from 'path';

/**
 * Normalizes a file or folder path for cross-platform library processing.
 *
 * - Standardizes slashes
 * - Resolves redundant segments (. and ..)
 * - Standardizes Windows drive letters to uppercase (e.g. c:\ -> C:)
 * - Removes trailing separators (except drive roots like C:\ or root /)
 */
export const normalizeLibraryPath = (
  rawPath: string,
  platform: NodeJS.Platform = process.platform
): string => {
  if (!rawPath || typeof rawPath !== 'string') return '';

  const pathModule = platform === 'win32' ? path.win32 : path.posix;
  let normalized = pathModule.normalize(rawPath.trim());

  if (platform === 'win32') {
    // Standardize drive letter to uppercase on Windows
    if (/^[a-zA-Z]:/.test(normalized)) {
      normalized = normalized[0].toUpperCase() + normalized.slice(1);
    }
  }

  // Remove trailing slashes unless it's a root path like "C:\" or "/"
  if (normalized.length > 1) {
    if (platform === 'win32' && /^[a-zA-Z]:\\?$/.test(normalized)) {
      // Keep "C:\" format for Windows drive roots
      if (!normalized.endsWith('\\')) normalized += '\\';
    } else if (normalized.endsWith(pathModule.sep)) {
      normalized = normalized.slice(0, -pathModule.sep.length);
    }
  }

  return normalized;
};

/**
 * Produces a stable lookup key for Map/Set indexing. On Windows, paths are case-insensitive, so the
 * key is lowercased. On POSIX systems (Linux), case sensitivity is preserved.
 */
export const getNormalizedPathKey = (
  filePath: string,
  platform: NodeJS.Platform = process.platform
): string => {
  const normalized = normalizeLibraryPath(filePath, platform);
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
};

/** Checks whether a given target path is within or equal to a root directory path. */
export const isPathInsideRoot = (
  targetPath: string,
  rootPath: string,
  platform: NodeJS.Platform = process.platform
): boolean => {
  const targetKey = getNormalizedPathKey(targetPath, platform);
  const rootKey = getNormalizedPathKey(rootPath, platform);

  if (targetKey === rootKey) return true;

  const separator = platform === 'win32' ? '\\' : '/';
  const rootPrefix = rootKey.endsWith(separator) ? rootKey : rootKey + separator;

  return targetKey.startsWith(rootPrefix);
};
