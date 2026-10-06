import path from 'path';
import { app } from 'electron';
import { db } from '@db/db';
import { musicFolders, songs } from '@db/schema';
import { eq } from 'drizzle-orm';

/**
 * Denylist check: rejects system root directories and sensitive dotfiles.
 */
export function isSystemOrSensitivePath(normalizedPath: string): boolean {
  const lower = normalizedPath.toLowerCase();

  // Windows system directories
  const winSystemRoots = [
    process.env.SystemRoot,
    process.env.WINDIR,
    process.env['ProgramFiles'],
    process.env['ProgramFiles(x86)'],
    process.env['ProgramData']
  ].filter(Boolean) as string[];

  for (const sysRoot of winSystemRoots) {
    const normSys = path.resolve(sysRoot).toLowerCase();
    if (lower === normSys || lower.startsWith(normSys.endsWith(path.sep) ? normSys : normSys + path.sep)) {
      return true;
    }
  }

  // Regex fallback for Windows drive system folders (e.g. C:\Windows, C:\Program Files)
  if (/^[a-zA-Z]:\\(?:windows|program files|program files \(x86\)|programdata)(?:\\|$)/i.test(lower)) {
    return true;
  }

  // POSIX system directories
  if (/^(?:\/etc|\/sys|\/proc|\/dev|\/boot|\/root|\/bin|\/sbin|\/usr)(?:\/|$)/i.test(lower)) {
    return true;
  }

  // Sensitive dot-directories
  if (/[\\/]\.(ssh|aws|gnupg|git|config|env)(?:[\\/]|$)/i.test(lower)) {
    return true;
  }

  return false;
}

let cachedFolders: string[] = [];
let cacheExpiresAt = 0;

export function invalidateAllowedFoldersCache(): void {
  cacheExpiresAt = 0;
}

async function getAllowedLibraryFolders(): Promise<string[]> {
  const now = Date.now();
  if (now < cacheExpiresAt) {
    return cachedFolders;
  }

  try {
    const rows = await db.select({ path: musicFolders.path }).from(musicFolders);
    cachedFolders = rows.map((r) => path.resolve(r.path).toLowerCase());
    cacheExpiresAt = now + 5000; // 5s TTL
  } catch {
    // If DB is busy or not ready, reuse stale cache
  }
  return cachedFolders;
}

export function isPathInside(childPath: string, parentDir: string): boolean {
  const child = path.resolve(childPath).toLowerCase();
  const parent = path.resolve(parentDir).toLowerCase();
  if (child === parent) return true;
  const parentWithSep = parent.endsWith(path.sep) ? parent : parent + path.sep;
  return child.startsWith(parentWithSep);
}

/**
 * Validates whether a file path is safe to be served by the nora:// custom protocol.
 */
export async function isAllowedNoraFilePath(rawFilePath: string): Promise<boolean> {
  if (!rawFilePath || typeof rawFilePath !== 'string') return false;

  const normalized = path.resolve(rawFilePath);

  // 1. Unconditional denylist (system roots & credentials)
  if (isSystemOrSensitivePath(normalized)) {
    return false;
  }

  // 2. Safe application directories (userData, temp, appPath, OS music directory)
  const safeAppPaths: string[] = [];
  try {
    if (app?.getPath) {
      safeAppPaths.push(app.getPath('userData'));
      safeAppPaths.push(app.getPath('temp'));
      try {
        safeAppPaths.push(app.getPath('music'));
      } catch {
        // OS may not define a standard music directory or permission denied
      }
    }
    if (app?.getAppPath) {
      safeAppPaths.push(app.getAppPath());
    }
  } catch {
    // Electron app object may be partially mocked or uninitialized in unit test harness
  }

  for (const safePath of safeAppPaths) {
    if (isPathInside(normalized, safePath)) {
      return true;
    }
  }

  // 3. User configured music library folders
  const libraryFolders = await getAllowedLibraryFolders();
  for (const folder of libraryFolders) {
    if (isPathInside(normalized, folder)) {
      return true;
    }
  }

  // 4. Exact match in songs table
  try {
    const existing = await db
      .select({ id: songs.id })
      .from(songs)
      .where(eq(songs.path, rawFilePath))
      .limit(1);
    if (existing.length > 0) {
      return true;
    }
  } catch {
    // Database query may fail during early bootstrap or concurrent schema operations; fail closed
  }

  return false;
}
