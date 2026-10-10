import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const { testUserDataDir } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('node:os') as typeof import('node:os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('node:path') as typeof import('node:path');
  return {
    testUserDataDir: nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'nora-visual-assets-test-'))
  };
});

vi.mock('electron', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    app: {
      ...(actual.app as object),
      getPath: () => testUserDataDir,
      getAppPath: () => process.cwd(),
      isPackaged: false
    },
    nativeImage: {
      createFromPath: (targetPath?: string) => ({
        isEmpty: () =>
          typeof targetPath === 'string' &&
          (targetPath.includes('corrupt') || targetPath.includes('empty_data')),
        resize: () => ({ isEmpty: () => false })
      }),
      createFromBuffer: (buf?: Buffer) => ({
        isEmpty: () => !buf || buf.length === 0,
        resize: () => ({ isEmpty: () => false })
      })
    }
  };
});

import {
  BUILTIN_VISUAL_PRESETS,
  isValidBuiltinPresetId,
  isValidVisualSlotId,
  normalizeVisualAssetsConfig,
  VISUAL_SLOT_IDS_SET
} from '@common/visualSlots';
import {
  applyDynamicNowPlayingIconToSurfaces,
  assignVisualSlot,
  deleteCustomVisualAsset,
  getCustomAssetsFilesDir,
  getCustomAssetsManifestPath,
  reconcileVisualAssets,
  resetDynamicIconRequestIdForTesting,
  resetVisualSlots,
  sanitizeAndValidateSvg,
  setVisualAssetsDynamicMode,
  validateAndImportVisualAssetFile
} from '@main/core/visualAssetsService';
import { getUserSettings, saveUserSettings } from '@main/db/queries/settings';
import { seedDatabase } from '@main/db/seed';

describe('Custom Assets & Visual Slots Engine', () => {
  let sourceTmpDir: string;

  beforeAll(async () => {
    await seedDatabase();
    sourceTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nora-visual-src-'));
  });

  afterAll(() => {
    try {
      fs.rmSync(sourceTmpDir, { recursive: true, force: true });
      fs.rmSync(testUserDataDir, { recursive: true, force: true });
    } catch {
      // ignore transient Windows cleanup lock
    }
  });

  describe('Slot Registry & Normalization (visualSlots.ts)', () => {
    it('defines all required brand.*, nav.*, and empty.* visual slots and 11 built-in presets', () => {
      expect(VISUAL_SLOT_IDS_SET.has('brand.appLogo')).toBe(true);
      expect(VISUAL_SLOT_IDS_SET.has('brand.nativeIcon')).toBe(true);
      expect(VISUAL_SLOT_IDS_SET.has('nav.home')).toBe(true);
      expect(VISUAL_SLOT_IDS_SET.has('nav.songs')).toBe(true);
      expect(VISUAL_SLOT_IDS_SET.has('nav.settings')).toBe(true);
      expect(VISUAL_SLOT_IDS_SET.has('empty.noSongs')).toBe(true);
      expect(VISUAL_SLOT_IDS_SET.has('empty.noSearchResults')).toBe(true);
      expect(BUILTIN_VISUAL_PRESETS).toHaveLength(11);

      expect(isValidVisualSlotId('brand.appLogo')).toBe(true);
      expect(isValidVisualSlotId('arbitrary.slot')).toBe(false);
      expect(isValidBuiltinPresetId('icon_04')).toBe(true);
      expect(isValidBuiltinPresetId('icon_99')).toBe(false);
    });

    it('normalizes malformed configs and drops dangling custom slot references', () => {
      const normalized = normalizeVisualAssetsConfig({
        slots: {
          'brand.appLogo': { type: 'preset', id: 'icon_01' },
          'brand.nativeIcon': { type: 'custom', id: 'asset-missing1234' },
          // @ts-expect-error testing unknown slot key rejection
          'unknown.slot': { type: 'preset', id: 'icon_01' }
        },
        customAssets: []
      });

      expect(normalized.slots['brand.appLogo']).toEqual({ type: 'preset', id: 'icon_01' });
      expect(normalized.slots['brand.nativeIcon']).toBeUndefined();
      expect((normalized.slots as Record<string, unknown>)['unknown.slot']).toBeUndefined();
    });
  });

  describe('Safe SVG Sanitizer & Validator', () => {
    it('accepts clean vector SVG and fixes Legacy ElementTree ns0: prefixes', () => {
      const clean = sanitizeAndValidateSvg(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="24" fill="#6366f1"/></svg>'
      );
      expect(clean.valid).toBe(true);
      expect(clean.sanitized).toContain('<svg');
      expect(clean.sanitized).toContain('<circle');

      const ns0Fixed = sanitizeAndValidateSvg(
        '<ns0:svg xmlns:ns0="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><ns0:path d="M0 0h32v32H0z"/></ns0:svg>'
      );
      expect(ns0Fixed.valid).toBe(true);
      expect(ns0Fixed.sanitized).not.toContain('ns0:');
      expect(ns0Fixed.sanitized).toContain('xmlns="http://www.w3.org/2000/svg"');
    });

    it('rejects dangerous SVG payloads (XXE, script, foreignObject, event handlers, external URLs)', () => {
      const xxe = sanitizeAndValidateSvg(
        '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg>&xxe;</svg>'
      );
      expect(xxe.valid).toBe(false);
      expect(xxe.error).toMatch(/entity/i);

      const script = sanitizeAndValidateSvg('<svg><script>alert(1)</script></svg>');
      expect(script.valid).toBe(false);
      expect(script.error).toMatch(/<script>/i);

      const foreign = sanitizeAndValidateSvg(
        '<svg><foreignObject><div>hi</div></foreignObject></svg>'
      );
      expect(foreign.valid).toBe(false);
      expect(foreign.error).toMatch(/<foreignObject>/i);

      const eventAttr = sanitizeAndValidateSvg(
        '<svg onload="alert(1)"><rect width="10" height="10"/></svg>'
      );
      expect(eventAttr.valid).toBe(false);
      expect(eventAttr.error).toMatch(/event handler/i);

      const externalUrl = sanitizeAndValidateSvg(
        '<svg><image href="https://evil.example/payload.svg"/></svg>'
      );
      expect(externalUrl.valid).toBe(false);
      expect(externalUrl.error).toMatch(/external/i);
    });
  });

  describe('Managed Folder Lifecycle (Import, Assign, Reconcile, Delete, Reset)', () => {
    it('imports a valid SVG, rasterizes native 512x512 PNG, assigns slots, reconciles missing files, and cleans up on delete', async () => {
      await saveUserSettings({ visualAssetsConfig: { slots: {}, customAssets: [] } });

      const svgPath = path.join(sourceTmpDir, 'custom-star.svg');
      fs.writeFileSync(
        svgPath,
        '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="#4f46e5"/><circle cx="64" cy="64" r="36" fill="#ffffff"/></svg>',
        'utf8'
      );

      const importRes = await validateAndImportVisualAssetFile(svgPath, { name: 'Indigo Orb' });
      expect(importRes.success).toBe(true);
      expect(importRes.asset).toBeDefined();
      const asset = importRes.asset!;
      expect(asset.name).toBe('Indigo Orb');
      expect(asset.ext).toBe('.svg');

      // Source file remains untouched; managed files exist in userData/custom_assets/assets/
      expect(fs.existsSync(svgPath)).toBe(true);
      const managedPrimary = path.join(getCustomAssetsFilesDir(), asset.fileName);
      const managedNative = path.join(getCustomAssetsFilesDir(), asset.nativeFileName);
      expect(fs.existsSync(managedPrimary)).toBe(true);
      expect(fs.existsSync(managedNative)).toBe(true);
      expect(fs.existsSync(getCustomAssetsManifestPath())).toBe(true);

      const nativeMeta = await sharp(managedNative).metadata();
      expect(nativeMeta.width).toBe(512);
      expect(nativeMeta.height).toBe(512);
      expect(nativeMeta.format).toBe('png');

      // Assign to brand.appLogo and nav.home
      const assignLogo = await assignVisualSlot('brand.appLogo', {
        type: 'custom',
        id: asset.id
      });
      expect(assignLogo.success).toBe(true);
      expect(assignLogo.config.slots['brand.appLogo']).toEqual({
        type: 'custom',
        id: asset.id
      });

      const assignNav = await assignVisualSlot('nav.home', {
        type: 'custom',
        id: asset.id
      });
      expect(assignNav.success).toBe(true);

      // Delete the custom asset -> must first unassign both slots and remove managed files
      const delRes = await deleteCustomVisualAsset(asset.id);
      expect(delRes.success).toBe(true);
      expect(delRes.unassignedSlots).toEqual(expect.arrayContaining(['brand.appLogo', 'nav.home']));
      expect(delRes.config.slots['brand.appLogo']).toBeUndefined();
      expect(delRes.config.slots['nav.home']).toBeUndefined();
      expect(fs.existsSync(managedPrimary)).toBe(false);
      expect(fs.existsSync(managedNative)).toBe(false);
    });

    it('falls back to default during reconciliation if a managed custom asset file is missing on disk', async () => {
      const pngPath = path.join(sourceTmpDir, 'custom-icon.png');
      await sharp({
        create: {
          width: 256,
          height: 256,
          channels: 4,
          background: { r: 16, g: 185, b: 129, alpha: 1 }
        }
      })
        .png()
        .toFile(pngPath);

      const importRes = await validateAndImportVisualAssetFile(pngPath, {
        name: 'Emerald Square'
      });
      expect(importRes.success).toBe(true);
      const asset = importRes.asset!;

      await assignVisualSlot('brand.nativeIcon', { type: 'custom', id: asset.id });
      await assignVisualSlot('brand.appLogo', { type: 'preset', id: 'icon_04' });

      // Simulate user deleting the managed file outside Nora
      fs.rmSync(path.join(getCustomAssetsFilesDir(), asset.fileName), { force: true });

      const currentSettings = await getUserSettings();
      const reconciled = await reconcileVisualAssets(currentSettings.visualAssetsConfig);

      // Missing custom asset is pruned and its slot falls back to default, while preset assignment stays intact
      expect(reconciled.customAssets.find((a) => a.id === asset.id)).toBeUndefined();
      expect(reconciled.slots['brand.nativeIcon']).toBeUndefined();
      expect(reconciled.slots['brand.appLogo']).toEqual({ type: 'preset', id: 'icon_04' });

      // Reset all slots restores defaults
      const resetRes = await resetVisualSlots();
      expect(resetRes.success).toBe(true);
      expect(resetRes.config.slots['brand.appLogo']).toBeUndefined();
    });
  });

  describe('Dynamic Now-Playing App Icon Pipeline', () => {
    let artworkPath: string;
    let mockWindow: {
      setIcon: ReturnType<typeof vi.fn>;
      isDestroyed: () => boolean;
    };
    let mockTray: {
      setImage: ReturnType<typeof vi.fn>;
      isDestroyed: () => boolean;
    };

    beforeAll(async () => {
      artworkPath = path.join(sourceTmpDir, 'track_art.webp');
      await sharp({
        create: {
          width: 500,
          height: 500,
          channels: 4,
          background: { r: 59, g: 130, b: 246, alpha: 1 }
        }
      })
        .webp()
        .toFile(artworkPath);
    });

    beforeEach(() => {
      resetDynamicIconRequestIdForTesting();
      mockWindow = {
        setIcon: vi.fn(),
        isDestroyed: () => false
      };
      mockTray = {
        setImage: vi.fn(),
        isDestroyed: () => false
      };
    });

    it('applies genuine artwork to window and tray surfaces with protocol normalization', async () => {
      const protocolUrl = `nora://localfiles/${artworkPath.replaceAll('\\', '/')}?ts=172800000`;
      const res = await applyDynamicNowPlayingIconToSurfaces(
        protocolUrl,
        {
          mainWindow: mockWindow as any,
          tray: mockTray as any,
          userDataDir: testUserDataDir
        },
        {
          validatePath: async () => true
        }
      );

      expect(res.applied).toBe(true);
      expect(res.reason).toBe('applied_artwork');
      expect(mockWindow.setIcon).toHaveBeenCalledTimes(1);
      expect(mockTray.setImage).toHaveBeenCalledTimes(1);
    });

    it('restores user-configured static brand.nativeIcon when artworkPath is null or empty', async () => {
      // First assign a custom static icon to verify it restores the user choice, not a hardcoded icon
      const staticPng = path.join(sourceTmpDir, 'static-preset.png');
      await sharp({
        create: {
          width: 256,
          height: 256,
          channels: 4,
          background: { r: 244, g: 63, b: 94, alpha: 1 }
        }
      })
        .png()
        .toFile(staticPng);

      const imported = await validateAndImportVisualAssetFile(staticPng, {
        name: 'Rose Static'
      });
      await assignVisualSlot('brand.nativeIcon', { type: 'custom', id: imported.asset!.id });

      const res = await applyDynamicNowPlayingIconToSurfaces(null, {
        mainWindow: mockWindow as any,
        tray: mockTray as any,
        userDataDir: testUserDataDir
      });

      expect(res.applied).toBe(true);
      expect(res.reason).toBe('restored_static');
      expect(mockWindow.setIcon).toHaveBeenCalledTimes(1);
      expect(mockTray.setImage).toHaveBeenCalledTimes(1);
    });

    it('rejects untrusted paths and invalid extensions and falls back to static icon', async () => {
      // 1. Untrusted path rejected by path validation
      const untrustedRes = await applyDynamicNowPlayingIconToSurfaces(
        artworkPath,
        {
          mainWindow: mockWindow as any,
          tray: mockTray as any,
          userDataDir: testUserDataDir
        },
        {
          validatePath: async () => false // rejects untrusted path
        }
      );
      expect(untrustedRes.applied).toBe(false);
      expect(untrustedRes.reason).toBe('invalid_path');
      expect(mockWindow.setIcon).toHaveBeenCalled();

      // 2. Unsupported extension rejected
      const badExtRes = await applyDynamicNowPlayingIconToSurfaces(
        path.join(sourceTmpDir, 'malicious.exe'),
        {
          mainWindow: mockWindow as any,
          tray: mockTray as any,
          userDataDir: testUserDataDir
        },
        {
          validatePath: async () => true
        }
      );
      expect(badExtRes.applied).toBe(false);
      expect(badExtRes.reason).toBe('invalid_path');

      // 3. Malformed URI (% without valid hex) safely caught without throwing URIError
      const malformedUriRes = await applyDynamicNowPlayingIconToSurfaces(
        'nora://localfiles/C:/music/track_100%.webp',
        {
          mainWindow: mockWindow as any,
          tray: mockTray as any,
          userDataDir: testUserDataDir
        },
        {
          validatePath: async () => false
        }
      );
      expect(malformedUriRes.applied).toBe(false);
      expect(malformedUriRes.reason).toBe('invalid_path');
      expect(mockWindow.setIcon).toHaveBeenCalled();
    });

    it('discards stale asynchronous completions when a newer request arrives before completion', async () => {
      // Request 1: Slow / delayed operation
      let triggerSlowValidation!: (val: boolean) => void;
      const slowPromise = new Promise<boolean>((resolve) => {
        triggerSlowValidation = resolve;
      });

      const req1Promise = applyDynamicNowPlayingIconToSurfaces(
        artworkPath,
        {
          mainWindow: mockWindow as any,
          tray: mockTray as any,
          userDataDir: testUserDataDir
        },
        {
          validatePath: () => slowPromise
        }
      );

      // Request 2 arrives immediately before Request 1 finishes (e.g. queue cleared or fast track skip)
      const req2Promise = applyDynamicNowPlayingIconToSurfaces(null, {
        mainWindow: mockWindow as any,
        tray: mockTray as any,
        userDataDir: testUserDataDir
      });

      const req2Res = await req2Promise;
      expect(req2Res.applied).toBe(true);
      expect(req2Res.reason).toBe('restored_static');

      // Now request 1 finally finishes:
      triggerSlowValidation(true);
      const req1Res = await req1Promise;

      // Request 1 must be discarded as stale and must NOT overwrite Request 2!
      expect(req1Res.applied).toBe(false);
      expect(req1Res.reason).toBe('stale_request');
    });

    it('handles non-existent files and decode failures gracefully', async () => {
      const nonExistentPath = path.join(sourceTmpDir, 'missing_artwork.webp');
      const missingRes = await applyDynamicNowPlayingIconToSurfaces(
        nonExistentPath,
        {
          mainWindow: mockWindow as any,
          tray: mockTray as any,
          userDataDir: testUserDataDir
        },
        {
          validatePath: async () => true
        }
      );
      expect(missingRes.applied).toBe(false);
      expect(missingRes.reason).toBe('file_missing');

      // Decode failure simulation (corrupt file)
      const corruptPath = path.join(sourceTmpDir, 'corrupt_art.webp');
      fs.writeFileSync(corruptPath, 'corrupted-binary-content');
      const corruptRes = await applyDynamicNowPlayingIconToSurfaces(
        corruptPath,
        {
          mainWindow: mockWindow as any,
          tray: mockTray as any,
          userDataDir: testUserDataDir
        },
        {
          validatePath: async () => true
        }
      );
      expect(corruptRes.applied).toBe(false);
      expect(corruptRes.reason).toBe('decode_failed');
    });

    it('toggles dynamicNowPlayingIcon mode in user_settings and manifest', async () => {
      const enableRes = await setVisualAssetsDynamicMode(true, { userDataDir: testUserDataDir });
      expect(enableRes.success).toBe(true);
      expect(enableRes.config.dynamicNowPlayingIcon).toBe(true);

      const currentSettings = await getUserSettings();
      expect(currentSettings.visualAssetsConfig?.dynamicNowPlayingIcon).toBe(true);

      const disableRes = await setVisualAssetsDynamicMode(false, {
        userDataDir: testUserDataDir
      });
      expect(disableRes.success).toBe(true);
      expect(disableRes.config.dynamicNowPlayingIcon).toBe(false);
    });

    it('retains dynamicNowPlayingIcon setting during reconciliation and slot assignments', async () => {
      await setVisualAssetsDynamicMode(true, { userDataDir: testUserDataDir });

      const assignRes = await assignVisualSlot(
        'brand.appLogo',
        { type: 'preset', id: 'icon_02' },
        {
          userDataDir: testUserDataDir
        }
      );
      expect(assignRes.success).toBe(true);
      expect(assignRes.config.dynamicNowPlayingIcon).toBe(true);

      const reconciled = await reconcileVisualAssets(assignRes.config, {
        userDataDir: testUserDataDir,
        persistIfChanged: false
      });
      expect(reconciled.dynamicNowPlayingIcon).toBe(true);
    });
  });
});
