import { fileURLToPath } from 'url';

/**
 * Deterministically normalizes a file path or URI into a canonical path string.
 *
 * Operations performed: 1. Decodes file:// scheme if present. 2. Decodes URI percent-encoded
 * characters (e.g. %20 -> space). 3. Normalizes backslashes to forward slashes. 4. Lowercases
 * Windows drive letters (e.g. D:/ -> d:/) for case-insensitive drive letter comparisons. 5. Strips
 * trailing slashes.
 */
export function normalizeCanonicalPath(pathStr: string): string {
  if (!pathStr) return '';
  let p = pathStr.trim();

  // 1. Convert file:// URIs
  if (p.toLowerCase().startsWith('file://')) {
    try {
      p = fileURLToPath(p);
    } catch {
      p = p.replace(/^file:\/\/\/?/i, '');
    }
  }

  // 2. Decode percent-encoded sequences
  if (p.includes('%')) {
    try {
      p = decodeURIComponent(p);
    } catch {
      // Ignore malformed percent sequences
    }
  }

  // 3. Normalize slashes
  let normalized = p.replaceAll('\\', '/');

  // 4. Lowercase Windows drive letter prefix (e.g. C:/ -> c:/)
  if (/^[a-zA-Z]:\//.test(normalized)) {
    normalized = normalized[0].toLowerCase() + normalized.slice(1);
  }

  // 5. Strip trailing slashes (except root drive e.g. "c:/")
  while (normalized.length > 3 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}
