import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  type BuiltinVisualPresetId,
  type CustomVisualAssetMeta,
  isValidBuiltinPresetId,
  isValidCustomAssetId,
  isValidVisualSlotId,
  normalizeVisualAssetsConfig,
  VISUAL_SLOT_REGISTRY,
  type VisualAssetsConfig,
  type VisualSlotAssignment,
  type VisualSlotCategory,
  type VisualSlotId
} from '@common/visualSlots';
import { getUserSettings, saveUserSettings } from '@main/db/queries/settings';
import { removeDefaultAppProtocolFromFilePath } from '@main/fs/resolveFilePaths';
import { isAllowedNoraFilePath } from '@main/fs/validateFilePath';
import logger from '@main/logger';
import { app, type BrowserWindow, dialog, nativeImage, type Tray } from 'electron';
import sharp from 'sharp';

import noraDefaultIconPath from '../../../resources/logo_light_mode.png?asset';
import icon01Path from '../../renderer/src/assets/app_icons/icon_01.png?asset';
import icon02Path from '../../renderer/src/assets/app_icons/icon_02.png?asset';
import icon03Path from '../../renderer/src/assets/app_icons/icon_03.png?asset';
import icon04Path from '../../renderer/src/assets/app_icons/icon_04.png?asset';
import icon05Path from '../../renderer/src/assets/app_icons/icon_05.png?asset';
import icon08Path from '../../renderer/src/assets/app_icons/icon_08.png?asset';
import icon10Path from '../../renderer/src/assets/app_icons/icon_10.png?asset';
import icon13Path from '../../renderer/src/assets/app_icons/icon_13.png?asset';
import icon15Path from '../../renderer/src/assets/app_icons/icon_15.png?asset';
import icon18Path from '../../renderer/src/assets/app_icons/icon_18.png?asset';
import icon19Path from '../../renderer/src/assets/app_icons/icon_19.png?asset';

export const MAX_CUSTOM_ASSET_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_RASTER_DIMENSION = 4096;
export const NATIVE_ICON_DIMENSION = 512;

const BUILTIN_PRESET_NATIVE_PATHS: Readonly<Record<BuiltinVisualPresetId, string>> = {
  icon_01: icon01Path,
  icon_02: icon02Path,
  icon_03: icon03Path,
  icon_04: icon04Path,
  icon_05: icon05Path,
  icon_08: icon08Path,
  icon_10: icon10Path,
  icon_13: icon13Path,
  icon_15: icon15Path,
  icon_18: icon18Path,
  icon_19: icon19Path
};

export interface VisualAssetsManifest {
  version: 1;
  updatedAt: number;
  config: VisualAssetsConfig;
}

export interface VisualAssetImportResult {
  success: boolean;
  canceled?: boolean;
  asset?: CustomVisualAssetMeta;
  config: VisualAssetsConfig;
  customAssetsDir: string;
  error?: string;
}

export interface VisualSlotMutationResult {
  success: boolean;
  config: VisualAssetsConfig;
  customAssetsDir: string;
  unassignedSlots?: VisualSlotId[];
  error?: string;
}

export function getCustomAssetsRootDir(userDataDir = app.getPath('userData')): string {
  return path.join(userDataDir, 'custom_assets');
}

export function getCustomAssetsFilesDir(userDataDir = app.getPath('userData')): string {
  return path.join(getCustomAssetsRootDir(userDataDir), 'assets');
}

export function getCustomAssetsManifestPath(userDataDir = app.getPath('userData')): string {
  return path.join(getCustomAssetsRootDir(userDataDir), 'manifest.json');
}

/**
 * Validates and sanitizes an untrusted SVG string before storing or rasterizing.
 *
 * Security rules:
 *
 * - Rejects XML entity declarations (`<!ENTITY`) or DOCTYPE internal subsets (`[`) to prevent XXE /
 *   billion-laughs.
 * - Rejects `<script>`, `<foreignObject>`, `<iframe>`, `<embed>`, `<object>`, `<audio>`, `<video>`,
 *   and SMIL animation tags.
 * - Rejects inline event handlers (`onload=`, `onerror=`, `onclick=`, etc.) and `javascript:` /
 *   `data:text/html` URIs.
 * - Rejects external network or filesystem references (`http://`, `https://`, `file://`, `ftp://`,
 *   `@import`) outside standard XML namespace declarations.
 * - Normalizes Python ElementTree `<ns0:svg>` namespace prefixes.
 */
export function sanitizeAndValidateSvg(rawSvg: string): {
  valid: boolean;
  sanitized?: string;
  error?: string;
} {
  if (!rawSvg || typeof rawSvg !== 'string') {
    return { valid: false, error: 'SVG file is empty or unreadable.' };
  }

  // Normalize BOM and ElementTree ns0: prefixes if present
  let svg = rawSvg.replace(/^\uFEFF/, '').trim();
  if (svg.includes('<ns0:svg')) {
    svg = svg
      .replace(/<ns0:svg\s+xmlns:ns0=/g, '<svg xmlns=')
      .replace(/<ns0:/g, '<')
      .replace(/<\/ns0:/g, '</');
  }

  // Reject XML entities / DOCTYPE internal subset
  if (/<!ENTITY\b/i.test(svg) || /<!DOCTYPE[^>]*\[/i.test(svg)) {
    return {
      valid: false,
      error: 'SVG contains forbidden XML entity declarations.'
    };
  }

  // Must contain a valid <svg ...>...</svg> root
  if (!/<svg[\s>]/i.test(svg) || !/<\/svg\s*>/i.test(svg)) {
    return {
      valid: false,
      error: 'File does not contain a valid <svg> root element.'
    };
  }

  // Reject dangerous elements
  const forbiddenElementMatch = svg.match(
    /<\s*\/?\s*(script|foreignObject|iframe|embed|object|applet|audio|video|animate|animateTransform|animateMotion|set|mpath)\b/i
  );
  if (forbiddenElementMatch) {
    return {
      valid: false,
      error: `SVG contains unsupported or unsafe element <${forbiddenElementMatch[1]}>.`
    };
  }

  // Reject inline event handler attributes (e.g. onload=, onerror=, onclick=)
  if (/[\s"'/]+on[a-z]+\s*=/i.test(svg)) {
    return {
      valid: false,
      error: 'SVG contains forbidden inline event handler attributes.'
    };
  }

  // Reject javascript:, vbscript:, data:text/html URIs
  if (/(?:javascript|vbscript)\s*:/i.test(svg) || /data\s*:\s*text\/html/i.test(svg)) {
    return {
      valid: false,
      error: 'SVG contains forbidden script or executable data URIs.'
    };
  }

  // Strip benign xmlns declarations before checking for external resource URLs
  const withoutXmlns = svg.replace(/\bxmlns(?::[a-z0-9_-]+)?\s*=\s*(?:"[^"]*"|'[^']*')/gi, '');

  // Reject external resource references in href / xlink:href / src / url(...) / @import
  if (
    /@import\b/i.test(withoutXmlns) ||
    /\b(?:xlink:href|href|src)\s*=\s*["']\s*(?:https?:|ftp:|file:|\/\/)/i.test(withoutXmlns) ||
    /url\(\s*["']?\s*(?:https?:|ftp:|file:|\/\/)/i.test(withoutXmlns)
  ) {
    return {
      valid: false,
      error: 'SVG references external network or filesystem resources, which are not allowed.'
    };
  }

  return { valid: true, sanitized: svg };
}

async function writeManifestFile(
  config: VisualAssetsConfig,
  userDataDir = app.getPath('userData')
): Promise<void> {
  const rootDir = getCustomAssetsRootDir(userDataDir);
  const manifestPath = getCustomAssetsManifestPath(userDataDir);
  await fs.mkdir(rootDir, { recursive: true });
  const payload: VisualAssetsManifest = {
    version: 1,
    updatedAt: Date.now(),
    config
  };
  await fs.writeFile(manifestPath, JSON.stringify(payload, null, 2), 'utf8');
}

async function readManifestFile(
  userDataDir = app.getPath('userData')
): Promise<VisualAssetsConfig | null> {
  try {
    const manifestPath = getCustomAssetsManifestPath(userDataDir);
    const raw = await fs.readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<VisualAssetsManifest>;
    if (parsed && parsed.config) {
      return normalizeVisualAssetsConfig(parsed.config);
    }
  } catch {
    // Manifest missing or unreadable
  }
  return null;
}

/**
 * Reconciles `user_settings.visual_assets_config` against the physical files in
 * `<userData>/custom_assets/assets/` so missing or deleted files automatically fall back to default
 * without leaving broken icons or dangling references.
 */
export async function reconcileVisualAssets(
  rawConfig?: unknown,
  options?: { userDataDir?: string; persistIfChanged?: boolean }
): Promise<VisualAssetsConfig> {
  const userDataDir = options?.userDataDir ?? app.getPath('userData');
  const persistIfChanged = options?.persistIfChanged ?? true;
  const assetsDir = getCustomAssetsFilesDir(userDataDir);

  let baseConfig = normalizeVisualAssetsConfig(rawConfig);

  // If DB config is completely empty, check if a manifest.json exists on disk for recovery
  if (baseConfig.customAssets.length === 0 && Object.keys(baseConfig.slots).length === 0) {
    const manifestConfig = await readManifestFile(userDataDir);
    if (
      manifestConfig &&
      (manifestConfig.customAssets.length > 0 || Object.keys(manifestConfig.slots).length > 0)
    ) {
      baseConfig = manifestConfig;
    }
  }

  const validCustomAssets: CustomVisualAssetMeta[] = [];
  const validCustomIds = new Set<string>();
  let changed = false;

  for (const asset of baseConfig.customAssets) {
    const displayFilePath = path.join(assetsDir, asset.fileName);
    const nativeFilePath = path.join(assetsDir, asset.nativeFileName);
    try {
      const [displayStat, nativeStat] = await Promise.all([
        fs.stat(displayFilePath),
        fs.stat(nativeFilePath)
      ]);
      if (
        displayStat.isFile() &&
        displayStat.size > 0 &&
        nativeStat.isFile() &&
        nativeStat.size > 0
      ) {
        validCustomAssets.push(asset);
        validCustomIds.add(asset.id);
      } else {
        changed = true;
      }
    } catch {
      changed = true;
      logger.warn('Custom visual asset missing on disk; unassigning and pruning metadata', {
        assetId: asset.id,
        fileName: asset.fileName
      });
    }
  }

  const reconciledSlots: Partial<Record<VisualSlotId, VisualSlotAssignment>> = {};
  for (const [slotId, assignment] of Object.entries(baseConfig.slots)) {
    if (!isValidVisualSlotId(slotId) || !assignment) {
      changed = true;
      continue;
    }
    if (assignment.type === 'preset' && isValidBuiltinPresetId(assignment.id)) {
      reconciledSlots[slotId] = assignment;
    } else if (assignment.type === 'custom' && validCustomIds.has(assignment.id)) {
      reconciledSlots[slotId] = assignment;
    } else {
      changed = true;
    }
  }

  const reconciled: VisualAssetsConfig = {
    slots: reconciledSlots,
    customAssets: validCustomAssets,
    dynamicNowPlayingIcon: baseConfig.dynamicNowPlayingIcon
  };

  if (changed && persistIfChanged) {
    try {
      await saveUserSettings({ visualAssetsConfig: reconciled });
      await writeManifestFile(reconciled, userDataDir);
    } catch (error) {
      logger.warn('Failed to persist reconciled visualAssetsConfig', { error });
    }
  }

  return reconciled;
}

/**
 * Resolves the filesystem path for the native OS icon (`brand.nativeIcon`). Guarantees a valid PNG
 * path on disk, falling back to `noraDefaultIconPath`.
 */
export function resolveNativeIconFilePath(
  config?: VisualAssetsConfig | null,
  userDataDir = app.getPath('userData')
): string {
  const normalized = normalizeVisualAssetsConfig(config);
  const assignment = normalized.slots['brand.nativeIcon'];

  if (!assignment || assignment.type === 'default') {
    return noraDefaultIconPath;
  }

  if (assignment.type === 'preset' && isValidBuiltinPresetId(assignment.id)) {
    const presetPath = BUILTIN_PRESET_NATIVE_PATHS[assignment.id];
    if (presetPath && fsSync.existsSync(presetPath)) {
      return presetPath;
    }
    return noraDefaultIconPath;
  }

  if (assignment.type === 'custom') {
    const meta = normalized.customAssets.find((a) => a.id === assignment.id);
    if (meta) {
      const candidatePath = path.join(getCustomAssetsFilesDir(userDataDir), meta.nativeFileName);
      if (fsSync.existsSync(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return noraDefaultIconPath;
}

/**
 * Creates Electron `NativeImage` instances for the window/Dock icon and system tray. Falls back to
 * the packaged default icon if the target image cannot be decoded.
 */
export function createNativeIconImages(
  config?: VisualAssetsConfig | null,
  userDataDir = app.getPath('userData')
): {
  windowIcon: Electron.NativeImage;
  trayIcon: Electron.NativeImage;
  resolvedPath: string;
} {
  const candidatePath = resolveNativeIconFilePath(config, userDataDir);
  let baseImg = nativeImage.createFromPath(candidatePath);
  let resolvedPath = candidatePath;

  if (baseImg.isEmpty() && candidatePath !== noraDefaultIconPath) {
    logger.warn(
      'Custom or preset native icon returned empty NativeImage; falling back to default',
      {
        candidatePath
      }
    );
    baseImg = nativeImage.createFromPath(noraDefaultIconPath);
    resolvedPath = noraDefaultIconPath;
  }

  const windowIcon = baseImg.resize({ width: 256, height: 256 });
  const trayIcon = baseImg.resize(
    process.platform === 'darwin' ? { width: 15, height: 15 } : { width: 50, height: 50 }
  );

  return { windowIcon, trayIcon, resolvedPath };
}

/**
 * Applies the configured `brand.nativeIcon` to the running BrowserWindow, system Tray, and macOS
 * Dock.
 */
export function applyNativeAppIconToSurfaces(
  config: VisualAssetsConfig | null | undefined,
  surfaces: {
    mainWindow?: BrowserWindow | null;
    tray?: Tray | null;
    userDataDir?: string;
  }
): void {
  try {
    const { windowIcon, trayIcon } = createNativeIconImages(config, surfaces.userDataDir);

    if (surfaces.mainWindow && !surfaces.mainWindow.isDestroyed()) {
      surfaces.mainWindow.setIcon(windowIcon);
      if (
        process.platform === 'win32' &&
        typeof surfaces.mainWindow.setOverlayIcon === 'function'
      ) {
        try {
          surfaces.mainWindow.setOverlayIcon(null, '');
        } catch {
          // Ignore failures when clearing overlay on unsupported surfaces
        }
      }
    }

    if (surfaces.tray && !surfaces.tray.isDestroyed()) {
      surfaces.tray.setImage(trayIcon);
    }

    if (process.platform === 'darwin' && app?.dock?.setIcon) {
      app.dock.setIcon(windowIcon);
    }
  } catch (error) {
    logger.error('Failed to apply native app icon to OS surfaces', { error });
  }
}

let currentDynamicIconRequestId = 0;

export function getCurrentDynamicIconRequestId(): number {
  return currentDynamicIconRequestId;
}

export function resetDynamicIconRequestIdForTesting(): void {
  currentDynamicIconRequestId = 0;
}

export interface DynamicNowPlayingIconResult {
  applied: boolean;
  requestId: number;
  reason?:
    | 'restored_static'
    | 'applied_artwork'
    | 'stale_request'
    | 'invalid_path'
    | 'file_missing'
    | 'decode_failed';
}

/**
 * Applies current playing song artwork to native OS surfaces (window, tray, dock).
 *
 * Enforces security boundaries: 1. Validates and normalizes paths against approved directories via
 * `isAllowedNoraFilePath`. 2. Rejects unsupported file extensions (allows only raster WebP, PNG,
 * JPG, JPEG). 3. Prevents race conditions and stale async completion via monotonic request
 * generation tokens. 4. Gracefully restores the user's selected `brand.nativeIcon` when artwork is
 * missing or invalid.
 */
function safeDecodeUriComponent(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

export async function applyDynamicNowPlayingIconToSurfaces(
  artworkPath: string | null | undefined,
  surfaces: {
    mainWindow?: BrowserWindow | null;
    tray?: Tray | null;
    userDataDir?: string;
  },
  options?: {
    config?: VisualAssetsConfig | null;
    validatePath?: (filePath: string) => Promise<boolean>;
  }
): Promise<DynamicNowPlayingIconResult> {
  const requestId = ++currentDynamicIconRequestId;

  // 1. If null, empty, or explicit reset: restore user's configured brand.nativeIcon
  if (!artworkPath || typeof artworkPath !== 'string' || artworkPath.trim() === '') {
    const currentConfig = options?.config ?? (await getUserSettings()).visualAssetsConfig;
    if (requestId === currentDynamicIconRequestId) {
      applyNativeAppIconToSurfaces(currentConfig, surfaces);
      return { applied: true, requestId, reason: 'restored_static' };
    }
    return { applied: false, requestId, reason: 'stale_request' };
  }

  // 2. Clean the protocol, strip query params/hash, decode URI components, and normalize path
  let cleanPath: string;
  try {
    const withoutProtocol = removeDefaultAppProtocolFromFilePath(artworkPath.trim());
    const withoutQuery = withoutProtocol.split('?')[0].split('#')[0];
    cleanPath = path.normalize(safeDecodeUriComponent(withoutQuery));
  } catch (err) {
    logger.warn('Dynamic now-playing icon rejected: path parsing error', { artworkPath, err });
    const currentConfig = options?.config ?? (await getUserSettings()).visualAssetsConfig;
    if (requestId === currentDynamicIconRequestId) {
      applyNativeAppIconToSurfaces(currentConfig, surfaces);
    }
    return { applied: false, requestId, reason: 'invalid_path' };
  }
  const ext = path.extname(cleanPath).toLowerCase();
  const allowedExtensions = ['.webp', '.png', '.jpg', '.jpeg'];
  if (!allowedExtensions.includes(ext)) {
    logger.warn('Dynamic now-playing icon rejected: unsupported file extension', {
      artworkPath,
      ext
    });
    const currentConfig = options?.config ?? (await getUserSettings()).visualAssetsConfig;
    if (requestId === currentDynamicIconRequestId) {
      applyNativeAppIconToSurfaces(currentConfig, surfaces);
    }
    return { applied: false, requestId, reason: 'invalid_path' };
  }

  // 3. Path validation against approved locations (prevents path traversal / sensitive files)
  const validator = options?.validatePath ?? isAllowedNoraFilePath;
  const isAllowed = await validator(cleanPath);
  if (!isAllowed) {
    logger.warn('Dynamic now-playing icon rejected: untrusted path', { artworkPath, cleanPath });
    const currentConfig = options?.config ?? (await getUserSettings()).visualAssetsConfig;
    if (requestId === currentDynamicIconRequestId) {
      applyNativeAppIconToSurfaces(currentConfig, surfaces);
    }
    return { applied: false, requestId, reason: 'invalid_path' };
  }

  // 4. File existence check & high-resolution sibling upgrade
  // If cleanPath points to an -optimized thumbnail, check if the full-resolution original exists
  // on disk to guarantee maximum visual quality for the window and taskbar icons.
  let fileToDecode = cleanPath;
  if (cleanPath.includes('-optimized.')) {
    const highResSibling = cleanPath.replace(/-optimized(\.[a-z0-9]+)$/i, '$1');
    try {
      await fs.stat(highResSibling);
      fileToDecode = highResSibling;
    } catch {
      // High-resolution original not found; proceed with cleanPath
    }
  }

  try {
    await fs.stat(fileToDecode);
  } catch (err) {
    if (requestId !== currentDynamicIconRequestId) {
      logger.debug('Discarding stale dynamic now-playing icon update during stat check', {
        requestId,
        latestId: currentDynamicIconRequestId
      });
      return { applied: false, requestId, reason: 'stale_request' };
    }
    logger.warn('Dynamic now-playing icon rejected: file does not exist on disk', {
      cleanPath: fileToDecode,
      err
    });
    const currentConfig = options?.config ?? (await getUserSettings()).visualAssetsConfig;
    if (requestId === currentDynamicIconRequestId) {
      applyNativeAppIconToSurfaces(currentConfig, surfaces);
    }
    return { applied: false, requestId, reason: 'file_missing' };
  }

  // 5. Image decode check
  // Electron's nativeImage.createFromPath only natively supports PNG/JPEG, and returns an empty
  // image for WebP files. Since Nora stores song artworks as WebP, we use sharp to rasterize into
  // a standard PNG buffer, ensuring crisp decoding across all platforms.
  let baseImg: Electron.NativeImage;
  try {
    const pngBuffer = await sharp(fileToDecode)
      .resize(NATIVE_ICON_DIMENSION, NATIVE_ICON_DIMENSION, {
        fit: 'cover',
        position: 'centre'
      })
      .png({ compressionLevel: 6 })
      .toBuffer();
    baseImg = nativeImage.createFromBuffer(pngBuffer);
  } catch (sharpErr) {
    logger.debug('Sharp rasterization failed; falling back to nativeImage.createFromPath', {
      fileToDecode,
      sharpErr
    });
    baseImg = nativeImage.createFromPath(fileToDecode);
  }

  // 6. Check for stale asynchronous completion (latest request wins)
  if (requestId !== currentDynamicIconRequestId) {
    logger.debug('Discarding stale dynamic now-playing icon update', {
      requestId,
      latestId: currentDynamicIconRequestId
    });
    return { applied: false, requestId, reason: 'stale_request' };
  }

  if (baseImg.isEmpty()) {
    logger.warn('Dynamic now-playing icon rejected: failed to decode image', { cleanPath });
    const currentConfig = options?.config ?? (await getUserSettings()).visualAssetsConfig;
    if (requestId === currentDynamicIconRequestId) {
      applyNativeAppIconToSurfaces(currentConfig, surfaces);
    }
    return { applied: false, requestId, reason: 'decode_failed' };
  }

  // 7. Resize and apply to surfaces
  try {
    const windowIcon = baseImg;
    const trayIcon = baseImg.resize(
      process.platform === 'darwin' ? { width: 15, height: 15 } : { width: 32, height: 32 }
    );

    if (surfaces.mainWindow && !surfaces.mainWindow.isDestroyed()) {
      surfaces.mainWindow.setIcon(windowIcon);
      if (
        process.platform === 'win32' &&
        typeof surfaces.mainWindow.setOverlayIcon === 'function'
      ) {
        try {
          const overlayIcon = baseImg.resize({ width: 32, height: 32 });
          surfaces.mainWindow.setOverlayIcon(overlayIcon, 'Now Playing');
        } catch (overlayErr) {
          logger.debug('Failed to set taskbar overlay icon on Windows', { overlayErr });
        }
      }
    }
    if (surfaces.tray && !surfaces.tray.isDestroyed()) {
      surfaces.tray.setImage(trayIcon);
    }
    if (process.platform === 'darwin' && app?.dock?.setIcon) {
      app.dock.setIcon(windowIcon);
    }
    return { applied: true, requestId, reason: 'applied_artwork' };
  } catch (err) {
    logger.error('Failed to apply dynamic icon to surfaces', { err });
    const currentConfig = options?.config ?? (await getUserSettings()).visualAssetsConfig;
    if (requestId === currentDynamicIconRequestId) {
      applyNativeAppIconToSurfaces(currentConfig, surfaces);
    }
    return { applied: false, requestId, reason: 'decode_failed' };
  }
}

/** Updates the user preference for dynamic now-playing app icon mode. */
export async function setVisualAssetsDynamicMode(
  enabled: boolean,
  options?: { userDataDir?: string }
): Promise<{ success: boolean; config: VisualAssetsConfig }> {
  const settings = await getUserSettings();
  const currentConfig = await reconcileVisualAssets(settings.visualAssetsConfig, options);
  const updatedConfig: VisualAssetsConfig = {
    ...currentConfig,
    dynamicNowPlayingIcon: Boolean(enabled)
  };
  await saveUserSettings({ visualAssetsConfig: updatedConfig });
  await writeManifestFile(updatedConfig, options?.userDataDir);
  return { success: true, config: updatedConfig };
}

/**
 * Validates, normalizes, and copies an image file (`.png`, `.webp`, `.svg`) into
 * `<userData>/custom_assets/assets/` without modifying the source file.
 */
export async function validateAndImportVisualAssetFile(
  sourceFilePath: string,
  options?: {
    userDataDir?: string;
    currentConfig?: VisualAssetsConfig;
    name?: string;
  }
): Promise<VisualAssetImportResult> {
  const userDataDir = options?.userDataDir ?? app.getPath('userData');
  const assetsDir = getCustomAssetsFilesDir(userDataDir);
  const currentConfig =
    options?.currentConfig ??
    (await reconcileVisualAssets((await getUserSettings()).visualAssetsConfig, {
      userDataDir,
      persistIfChanged: false
    }));

  if (!sourceFilePath || typeof sourceFilePath !== 'string') {
    return {
      success: false,
      config: currentConfig,
      customAssetsDir: assetsDir,
      error: 'No file path provided.'
    };
  }

  const ext = path.extname(sourceFilePath).toLowerCase();
  if (ext !== '.png' && ext !== '.webp' && ext !== '.svg') {
    return {
      success: false,
      config: currentConfig,
      customAssetsDir: assetsDir,
      error: 'Unsupported image format. Please choose a PNG, WebP, or SVG file.'
    };
  }

  let stat: fsSync.Stats;
  try {
    stat = await fs.stat(sourceFilePath);
  } catch {
    return {
      success: false,
      config: currentConfig,
      customAssetsDir: assetsDir,
      error: 'Selected file could not be read.'
    };
  }

  if (!stat.isFile() || stat.size <= 0) {
    return {
      success: false,
      config: currentConfig,
      customAssetsDir: assetsDir,
      error: 'Selected file is empty or invalid.'
    };
  }

  if (stat.size > MAX_CUSTOM_ASSET_BYTES) {
    return {
      success: false,
      config: currentConfig,
      customAssetsDir: assetsDir,
      error: `Image exceeds the 5 MB maximum size limit (${(stat.size / (1024 * 1024)).toFixed(1)} MB).`
    };
  }

  const rawBuffer = await fs.readFile(sourceFilePath);
  const hashPrefix = crypto.createHash('sha256').update(rawBuffer).digest('hex').slice(0, 12);
  const assetId = `asset-${hashPrefix}`;

  await fs.mkdir(assetsDir, { recursive: true });

  let mimeType: CustomVisualAssetMeta['mimeType'];
  let storedExt: CustomVisualAssetMeta['ext'];
  let displayBuffer: Buffer;
  let nativePngBuffer: Buffer;
  const width = NATIVE_ICON_DIMENSION;
  const height = NATIVE_ICON_DIMENSION;

  try {
    if (ext === '.svg') {
      const rawText = rawBuffer.toString('utf8');
      const validation = sanitizeAndValidateSvg(rawText);
      if (!validation.valid || !validation.sanitized) {
        return {
          success: false,
          config: currentConfig,
          customAssetsDir: assetsDir,
          error: validation.error ?? 'Invalid SVG file.'
        };
      }

      const sanitizedBuffer = Buffer.from(validation.sanitized, 'utf8');
      // Verify that sharp can safely rasterize the SVG into a 512x512 native PNG
      nativePngBuffer = await sharp(sanitizedBuffer, { limitInputPixels: false })
        .resize(NATIVE_ICON_DIMENSION, NATIVE_ICON_DIMENSION, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png({ compressionLevel: 9, palette: true, quality: 95 })
        .toBuffer();

      displayBuffer = sanitizedBuffer;
      mimeType = 'image/svg+xml';
      storedExt = '.svg';
    } else {
      const metadata = await sharp(rawBuffer).metadata();
      if (
        !metadata.format ||
        (metadata.format !== 'png' && metadata.format !== 'webp') ||
        !metadata.width ||
        !metadata.height
      ) {
        return {
          success: false,
          config: currentConfig,
          customAssetsDir: assetsDir,
          error: 'File contents do not match a valid PNG or WebP image.'
        };
      }

      if (metadata.width > MAX_RASTER_DIMENSION || metadata.height > MAX_RASTER_DIMENSION) {
        return {
          success: false,
          config: currentConfig,
          customAssetsDir: assetsDir,
          error: `Image dimensions (${metadata.width}×${metadata.height}) exceed the ${MAX_RASTER_DIMENSION}×${MAX_RASTER_DIMENSION} limit.`
        };
      }

      nativePngBuffer = await sharp(rawBuffer)
        .resize(NATIVE_ICON_DIMENSION, NATIVE_ICON_DIMENSION, {
          fit: 'cover',
          position: 'centre'
        })
        .png({ compressionLevel: 9, palette: true, quality: 95 })
        .toBuffer();

      if (metadata.format === 'webp') {
        displayBuffer = await sharp(rawBuffer)
          .resize(NATIVE_ICON_DIMENSION, NATIVE_ICON_DIMENSION, {
            fit: 'cover',
            position: 'centre'
          })
          .webp({ quality: 92, alphaQuality: 100 })
          .toBuffer();
        mimeType = 'image/webp';
        storedExt = '.webp';
      } else {
        displayBuffer = nativePngBuffer;
        mimeType = 'image/png';
        storedExt = '.png';
      }
    }
  } catch (error) {
    logger.warn('Rejected malformed or un-rasterizable custom visual asset', {
      sourceFilePath,
      error
    });
    return {
      success: false,
      config: currentConfig,
      customAssetsDir: assetsDir,
      error: 'Failed to decode or rasterize the selected image.'
    };
  }

  const fileName = `${assetId}${storedExt}`;
  const nativeFileName = `${assetId}-native.png`;
  const displayDest = path.join(assetsDir, fileName);
  const nativeDest = path.join(assetsDir, nativeFileName);

  await fs.writeFile(displayDest, displayBuffer);
  await fs.writeFile(nativeDest, nativePngBuffer);

  const rawBaseName =
    options?.name?.trim() || path.basename(sourceFilePath, path.extname(sourceFilePath)).trim();
  const cleanName = (rawBaseName || assetId).slice(0, 80);

  const newMeta: CustomVisualAssetMeta = {
    id: assetId,
    name: cleanName,
    mimeType,
    ext: storedExt,
    fileName,
    nativeFileName,
    width,
    height,
    sizeBytes: displayBuffer.byteLength,
    createdAt: Date.now()
  };

  const existingWithoutCurrent = currentConfig.customAssets.filter((a) => a.id !== assetId);
  const updatedConfig: VisualAssetsConfig = {
    slots: { ...currentConfig.slots },
    customAssets: [newMeta, ...existingWithoutCurrent]
  };

  await saveUserSettings({ visualAssetsConfig: updatedConfig });
  await writeManifestFile(updatedConfig, userDataDir);

  return {
    success: true,
    asset: newMeta,
    config: updatedConfig,
    customAssetsDir: assetsDir
  };
}

export async function promptAndImportVisualAsset(
  parentWindow?: BrowserWindow | null
): Promise<VisualAssetImportResult> {
  const userDataDir = app.getPath('userData');
  const assetsDir = getCustomAssetsFilesDir(userDataDir);
  const settings = await getUserSettings();
  const currentConfig = await reconcileVisualAssets(settings.visualAssetsConfig, {
    userDataDir,
    persistIfChanged: false
  });

  const dialogResult = parentWindow
    ? await dialog.showOpenDialog(parentWindow, {
        title: 'Import Custom Icon or Illustration',
        buttonLabel: 'Import Asset',
        properties: ['openFile'],
        filters: [
          {
            name: 'Supported Images (PNG, WebP, SVG)',
            extensions: ['png', 'webp', 'svg']
          }
        ]
      })
    : await dialog.showOpenDialog({
        title: 'Import Custom Icon or Illustration',
        buttonLabel: 'Import Asset',
        properties: ['openFile'],
        filters: [
          {
            name: 'Supported Images (PNG, WebP, SVG)',
            extensions: ['png', 'webp', 'svg']
          }
        ]
      });

  if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
    return {
      success: false,
      canceled: true,
      config: currentConfig,
      customAssetsDir: assetsDir
    };
  }

  return validateAndImportVisualAssetFile(dialogResult.filePaths[0], {
    userDataDir,
    currentConfig
  });
}

export async function assignVisualSlot(
  slotId: VisualSlotId,
  assignment: VisualSlotAssignment,
  options?: {
    userDataDir?: string;
    mainWindow?: BrowserWindow | null;
    tray?: Tray | null;
  }
): Promise<VisualSlotMutationResult> {
  const userDataDir = options?.userDataDir ?? app.getPath('userData');
  const assetsDir = getCustomAssetsFilesDir(userDataDir);
  const settings = await getUserSettings();
  const currentConfig = await reconcileVisualAssets(settings.visualAssetsConfig, {
    userDataDir,
    persistIfChanged: false
  });

  if (!isValidVisualSlotId(slotId)) {
    return {
      success: false,
      config: currentConfig,
      customAssetsDir: assetsDir,
      error: `Invalid visual slot ID: ${String(slotId)}`
    };
  }

  const nextSlots = { ...currentConfig.slots };

  if (!assignment || assignment.type === 'default') {
    delete nextSlots[slotId];
  } else if (assignment.type === 'preset') {
    if (!isValidBuiltinPresetId(assignment.id)) {
      return {
        success: false,
        config: currentConfig,
        customAssetsDir: assetsDir,
        error: `Unknown built-in preset ID: ${String(assignment.id)}`
      };
    }
    nextSlots[slotId] = { type: 'preset', id: assignment.id };
  } else if (assignment.type === 'custom') {
    if (
      !isValidCustomAssetId(assignment.id) ||
      !currentConfig.customAssets.some((a) => a.id === assignment.id)
    ) {
      return {
        success: false,
        config: currentConfig,
        customAssetsDir: assetsDir,
        error: 'Selected custom asset does not exist.'
      };
    }
    nextSlots[slotId] = { type: 'custom', id: assignment.id };
  } else {
    return {
      success: false,
      config: currentConfig,
      customAssetsDir: assetsDir,
      error: 'Invalid slot assignment payload.'
    };
  }

  const updatedConfig: VisualAssetsConfig = {
    slots: nextSlots,
    customAssets: currentConfig.customAssets,
    dynamicNowPlayingIcon: currentConfig.dynamicNowPlayingIcon
  };

  await saveUserSettings({ visualAssetsConfig: updatedConfig });
  await writeManifestFile(updatedConfig, userDataDir);

  if (slotId === 'brand.nativeIcon') {
    applyNativeAppIconToSurfaces(updatedConfig, {
      mainWindow: options?.mainWindow,
      tray: options?.tray,
      userDataDir
    });
  }

  return {
    success: true,
    config: updatedConfig,
    customAssetsDir: assetsDir
  };
}

/**
 * Deletes a managed custom asset:
 *
 * 1. First unassigns any visual slots referencing `assetId` and persists settings + manifest.
 * 2. Re-applies the default native icon if `brand.nativeIcon` was assigned to `assetId`.
 * 3. Removes the managed files from `<userData>/custom_assets/assets/`.
 */
export async function deleteCustomVisualAsset(
  assetId: string,
  options?: {
    userDataDir?: string;
    mainWindow?: BrowserWindow | null;
    tray?: Tray | null;
  }
): Promise<VisualSlotMutationResult & { unassignedSlots: VisualSlotId[] }> {
  const userDataDir = options?.userDataDir ?? app.getPath('userData');
  const assetsDir = getCustomAssetsFilesDir(userDataDir);
  const settings = await getUserSettings();
  const currentConfig = await reconcileVisualAssets(settings.visualAssetsConfig, {
    userDataDir,
    persistIfChanged: false
  });

  if (!isValidCustomAssetId(assetId)) {
    return {
      success: false,
      config: currentConfig,
      customAssetsDir: assetsDir,
      unassignedSlots: [],
      error: 'Invalid custom asset ID.'
    };
  }

  const targetAsset = currentConfig.customAssets.find((a) => a.id === assetId);
  const nextSlots: Partial<Record<VisualSlotId, VisualSlotAssignment>> = {};
  const unassignedSlots: VisualSlotId[] = [];
  let nativeIconWasUnassigned = false;

  for (const [slotId, assignment] of Object.entries(currentConfig.slots)) {
    if (!isValidVisualSlotId(slotId) || !assignment) continue;
    if (assignment.type === 'custom' && assignment.id === assetId) {
      unassignedSlots.push(slotId);
      if (slotId === 'brand.nativeIcon') {
        nativeIconWasUnassigned = true;
      }
      continue;
    }
    nextSlots[slotId] = assignment;
  }

  const updatedConfig: VisualAssetsConfig = {
    slots: nextSlots,
    customAssets: currentConfig.customAssets.filter((a) => a.id !== assetId),
    dynamicNowPlayingIcon: currentConfig.dynamicNowPlayingIcon
  };

  // Step 1: Persist unassigned slots & updated metadata first
  await saveUserSettings({ visualAssetsConfig: updatedConfig });
  await writeManifestFile(updatedConfig, userDataDir);

  if (nativeIconWasUnassigned) {
    applyNativeAppIconToSurfaces(updatedConfig, {
      mainWindow: options?.mainWindow,
      tray: options?.tray,
      userDataDir
    });
  }

  // Step 2: Remove physical managed files
  if (targetAsset) {
    const filesToDelete = [
      path.join(assetsDir, targetAsset.fileName),
      path.join(assetsDir, targetAsset.nativeFileName)
    ];
    for (const filePath of filesToDelete) {
      try {
        await fs.rm(filePath, { force: true });
      } catch (error) {
        logger.warn('Failed to delete custom visual asset file', { filePath, error });
      }
    }
  }

  return {
    success: true,
    config: updatedConfig,
    customAssetsDir: assetsDir,
    unassignedSlots
  };
}

/**
 * Resets slot assignments back to default (either all slots or a specific category) without losing
 * unrelated user settings or deleting uploaded assets from the library.
 */
export async function resetVisualSlots(
  category?: VisualSlotCategory,
  options?: {
    userDataDir?: string;
    mainWindow?: BrowserWindow | null;
    tray?: Tray | null;
  }
): Promise<VisualSlotMutationResult> {
  const userDataDir = options?.userDataDir ?? app.getPath('userData');
  const assetsDir = getCustomAssetsFilesDir(userDataDir);
  const settings = await getUserSettings();
  const currentConfig = await reconcileVisualAssets(settings.visualAssetsConfig, {
    userDataDir,
    persistIfChanged: false
  });

  const nextSlots: Partial<Record<VisualSlotId, VisualSlotAssignment>> = {};
  if (category) {
    const slotsInCategory = new Set(
      VISUAL_SLOT_REGISTRY.filter((s) => s.category === category).map((s) => s.id)
    );
    for (const [slotId, assignment] of Object.entries(currentConfig.slots)) {
      if (isValidVisualSlotId(slotId) && assignment && !slotsInCategory.has(slotId)) {
        nextSlots[slotId] = assignment;
      }
    }
  }

  const updatedConfig: VisualAssetsConfig = {
    slots: nextSlots,
    customAssets: currentConfig.customAssets,
    dynamicNowPlayingIcon: currentConfig.dynamicNowPlayingIcon
  };

  await saveUserSettings({ visualAssetsConfig: updatedConfig });
  await writeManifestFile(updatedConfig, userDataDir);

  if (!category || category === 'brand') {
    applyNativeAppIconToSurfaces(updatedConfig, {
      mainWindow: options?.mainWindow,
      tray: options?.tray,
      userDataDir
    });
  }

  return {
    success: true,
    config: updatedConfig,
    customAssetsDir: assetsDir
  };
}
