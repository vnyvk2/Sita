import {
  normalizeVisualAssetsConfig,
  VISUAL_SLOT_REGISTRY,
  type BuiltinVisualPresetId,
  type CustomVisualAssetMeta,
  type VisualSlotAssignment,
  type VisualSlotId
} from '@common/visualSlots';
import { APP_ICON_PRESETS } from '@renderer/assets/app_icons';
import DefaultAppLogo from '@renderer/assets/images/webp/logo_light_mode.webp';
import { dynamicIconStore } from '@renderer/hooks/useDynamicAppIcon';
import { buildCustomAssetUrl, resolveVisualSlotUrl } from '@renderer/hooks/useVisualSlot';
import { settingsQuery } from '@renderer/queries/settings';
import { queryClient } from '@renderer/queryClient';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { useCallback, useMemo, useState } from 'react';

import Checkbox from '../../Checkbox';

type BrandTargetMode = 'both' | 'appLogo' | 'nativeIcon';

const NAV_SLOT_DESCRIPTORS = VISUAL_SLOT_REGISTRY.filter((s) => s.category === 'nav');
const EMPTY_SLOT_DESCRIPTORS = VISUAL_SLOT_REGISTRY.filter((s) => s.category === 'empty');

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatExtBadge(ext: CustomVisualAssetMeta['ext']): string {
  return ext.replace(/^\./, '').toUpperCase();
}

function serializeAssignment(assignment?: VisualSlotAssignment): string {
  if (!assignment || assignment.type === 'default') return 'default';
  return `${assignment.type}:${assignment.id}`;
}

function deserializeAssignment(value: string): VisualSlotAssignment {
  if (!value || value === 'default') return { type: 'default' };
  if (value.startsWith('preset:')) {
    return { type: 'preset', id: value.slice('preset:'.length) as BuiltinVisualPresetId };
  }
  if (value.startsWith('custom:')) {
    return { type: 'custom', id: value.slice('custom:'.length) };
  }
  return { type: 'default' };
}

const VisualAssetsSettings = () => {
  const { data: userSettings } = useQuery(settingsQuery.all);
  const [brandTarget, setBrandTarget] = useState<BrandTargetMode>('both');
  const [showSlotMatrix, setShowSlotMatrix] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const config = useMemo(
    () => normalizeVisualAssetsConfig(userSettings?.visualAssetsConfig),
    [userSettings?.visualAssetsConfig]
  );
  const customBaseUrl = userSettings?.customAssetsProtocolBaseUrl;

  const appLogoAssignment = config.slots['brand.appLogo'] ?? { type: 'default' };
  const nativeIconAssignment = config.slots['brand.nativeIcon'] ?? { type: 'default' };

  const isDynamicNowPlaying = Boolean(config.dynamicNowPlayingIcon);
  const activeDynamicArtwork = useStore(dynamicIconStore, (s) => s.activeDynamicArtworkUrl);
  const isDynamicActive = isDynamicNowPlaying && Boolean(activeDynamicArtwork);

  const staticAppLogoUrl =
    resolveVisualSlotUrl('brand.appLogo', config, customBaseUrl) ?? DefaultAppLogo;
  const staticNativeIconUrl =
    resolveVisualSlotUrl('brand.nativeIcon', config, customBaseUrl) ?? DefaultAppLogo;

  const appLogoPreviewUrl = isDynamicActive ? activeDynamicArtwork! : staticAppLogoUrl;
  const nativeIconPreviewUrl = isDynamicActive ? activeDynamicArtwork! : staticNativeIconUrl;

  const refreshSettings = useCallback(async () => {
    await queryClient.invalidateQueries(settingsQuery.all);
  }, []);

  const handleToggleDynamicNowPlaying = useCallback(
    async (nextVal: boolean) => {
      setIsBusy(true);
      setStatusMessage(null);
      try {
        const res = await window.api.visualAssets.setDynamicMode(nextVal);
        if (!res.success) {
          setStatusMessage({
            type: 'error',
            text: res.error ?? 'Failed to update dynamic icon mode.'
          });
        } else {
          await refreshSettings();
        }
      } catch (err) {
        setStatusMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Failed to update dynamic icon mode.'
        });
      } finally {
        setIsBusy(false);
      }
    },
    [refreshSettings]
  );

  const handleAssignSlot = useCallback(
    async (slotId: VisualSlotId, assignment: VisualSlotAssignment) => {
      setIsBusy(true);
      setStatusMessage(null);
      try {
        const res = await window.api.visualAssets.assignSlot(slotId, assignment);
        if (!res.success) {
          setStatusMessage({
            type: 'error',
            text: res.error ?? 'Failed to assign visual slot.'
          });
        } else {
          await refreshSettings();
        }
      } catch (err) {
        setStatusMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Failed to assign visual slot.'
        });
      } finally {
        setIsBusy(false);
      }
    },
    [refreshSettings]
  );

  const handleApplyBrandSelection = useCallback(
    async (assignment: VisualSlotAssignment) => {
      setIsBusy(true);
      setStatusMessage(null);
      try {
        const targetSlots: VisualSlotId[] =
          brandTarget === 'both'
            ? ['brand.appLogo', 'brand.nativeIcon']
            : brandTarget === 'appLogo'
              ? ['brand.appLogo']
              : ['brand.nativeIcon'];

        for (const slotId of targetSlots) {
          const res = await window.api.visualAssets.assignSlot(slotId, assignment);
          if (!res.success) {
            setStatusMessage({
              type: 'error',
              text: res.error ?? `Failed to update ${slotId}.`
            });
            await refreshSettings();
            return;
          }
        }
        await refreshSettings();
      } catch (err) {
        setStatusMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Failed to apply brand icon.'
        });
      } finally {
        setIsBusy(false);
      }
    },
    [brandTarget, refreshSettings]
  );

  const handleImportCustomAsset = useCallback(async () => {
    setIsBusy(true);
    setStatusMessage(null);
    try {
      const res = await window.api.visualAssets.importAsset();
      if (res.canceled) return;
      if (!res.success) {
        setStatusMessage({
          type: 'error',
          text: res.error ?? 'Failed to import custom asset.'
        });
        return;
      }
      await refreshSettings();
      if (res.asset) {
        setStatusMessage({
          type: 'success',
          text: `Imported "${res.asset.name}" (${formatExtBadge(res.asset.ext)}) into your Custom Asset Library.`
        });
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to import custom asset.'
      });
    } finally {
      setIsBusy(false);
    }
  }, [refreshSettings]);

  const handleDeleteCustomAsset = useCallback(
    async (asset: CustomVisualAssetMeta) => {
      setIsBusy(true);
      setStatusMessage(null);
      try {
        const res = await window.api.visualAssets.deleteAsset(asset.id);
        if (!res.success) {
          setStatusMessage({
            type: 'error',
            text: res.error ?? 'Failed to delete custom asset.'
          });
          return;
        }
        await refreshSettings();
        const unassignedCount = res.unassignedSlots?.length ?? 0;
        const unassignedNote =
          unassignedCount > 0 ? ` Reverted ${unassignedCount} assigned slot(s) to default.` : '';
        setStatusMessage({
          type: 'success',
          text: `Removed "${asset.name}".${unassignedNote}`
        });
      } catch (err) {
        setStatusMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Failed to delete custom asset.'
        });
      } finally {
        setIsBusy(false);
      }
    },
    [refreshSettings]
  );

  const handleResetAllSlots = useCallback(async () => {
    setIsBusy(true);
    setStatusMessage(null);
    try {
      const res = await window.api.visualAssets.resetSlots();
      if (res.success) {
        await refreshSettings();
        setStatusMessage({
          type: 'success',
          text: 'All visual slots restored to default.'
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: res.error ?? 'Failed to reset visual slots.'
        });
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to reset visual slots.'
      });
    } finally {
      setIsBusy(false);
    }
  }, [refreshSettings]);

  const isBrandOptionSelected = (candidate: VisualSlotAssignment): boolean => {
    const key = serializeAssignment(candidate);
    if (brandTarget === 'appLogo') return serializeAssignment(appLogoAssignment) === key;
    if (brandTarget === 'nativeIcon') return serializeAssignment(nativeIconAssignment) === key;
    return (
      serializeAssignment(appLogoAssignment) === key &&
      serializeAssignment(nativeIconAssignment) === key
    );
  };

  const customizedSlotCount = Object.values(config.slots).filter(
    (a) => a && a.type !== 'default'
  ).length;

  return (
    <li
      id="setting-appearance-visual-assets"
      className="secondary-container custom-visual-assets my-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="description font-medium">Custom App Icons &amp; Visual Assets</div>
          <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed mt-0.5 text-xs">
            Personalize Nora&apos;s app logo, running window/tray icon, sidebar navigation icons,
            and empty-state artwork using built-in presets or your own SVG/PNG/WebP files.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={handleImportCustomAsset}
            className="bg-font-color-highlight text-font-color-black dark:bg-dark-font-color-highlight flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <span className="material-icons-round text-base leading-none">upload_file</span>
            <span>Import SVG / Image</span>
          </button>
          {customizedSlotCount > 0 && (
            <button
              type="button"
              disabled={isBusy}
              onClick={handleResetAllSlots}
              className="bg-background-color-2 hover:bg-background-color-3 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3 cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
            >
              Restore Defaults ({customizedSlotCount})
            </button>
          )}
        </div>
      </div>

      {statusMessage && (
        <div
          role="status"
          className={`mt-3 flex items-center justify-between rounded-md px-3 py-2 text-xs ${
            statusMessage.type === 'error'
              ? 'bg-red-500/15 text-red-600 dark:text-red-300'
              : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          <span>{statusMessage.text}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="ml-3 cursor-pointer text-xs opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Dynamic Now-Playing App Icon Toggle Card */}
      <div className="bg-background-color-2/50 dark:bg-dark-background-color-2/50 mt-4 flex flex-col justify-between gap-4 rounded-lg p-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-icons-round text-font-color-highlight text-lg">
              motion_photos_auto
            </span>
            <span className="text-font-color-black dark:text-font-color-white text-xs font-semibold sm:text-sm">
              Dynamic Now-Playing App Icon
            </span>
          </div>
          <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed mt-1 max-w-xl text-[11px] leading-relaxed">
            Reflects the current song’s album artwork on the in-app logo, window, and tray icons.
            Applies immediately to the first loaded song, and uses a 3.5-second debounce during
            track skipping. Reverts to your selected static icon when playback stops or no artwork
            exists.
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          <Checkbox
            id="dynamicNowPlayingIconToggle"
            isChecked={isDynamicNowPlaying}
            isDisabled={isBusy}
            checkedStateUpdateFunction={handleToggleDynamicNowPlaying}
          />
        </div>
      </div>

      {/* Active Branding Status + Target Mode Selector */}
      <div className="bg-background-color-2/50 dark:bg-dark-background-color-2/50 mt-4 rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <img
                src={appLogoPreviewUrl}
                alt="In-App Logo Preview"
                className={`bg-background-color-1 dark:bg-dark-background-color-1 h-11 w-11 rounded-lg ${
                  isDynamicActive ? 'object-cover p-0' : 'object-contain p-1'
                } shadow-sm`}
              />
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold">In-App Logo</span>
                  {isDynamicActive && (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
                      Now-Playing
                    </span>
                  )}
                </div>
                <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[11px]">
                  {isDynamicActive
                    ? 'Showing current track album art'
                    : 'Title bar, About & Preloader'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <img
                src={nativeIconPreviewUrl}
                alt="Native Window & Tray Icon Preview"
                className={`bg-background-color-1 dark:bg-dark-background-color-1 h-11 w-11 rounded-lg ${
                  isDynamicActive ? 'object-cover p-0' : 'object-contain p-1'
                } shadow-sm`}
              />
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold">Running Window &amp; Tray</span>
                  {isDynamicActive && (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
                      Now-Playing
                    </span>
                  )}
                </div>
                <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[11px]">
                  {isDynamicActive
                    ? 'Active on window, tray & Alt+Tab'
                    : 'Window, system tray & Dock'}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-md bg-black/5 p-1 text-xs dark:bg-white/5">
            {(
              [
                { id: 'both', label: 'Apply to Both' },
                { id: 'appLogo', label: 'In-App Logo Only' },
                { id: 'nativeIcon', label: 'Native Icon Only' }
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setBrandTarget(mode.id)}
                className={`cursor-pointer rounded px-2.5 py-1 transition-colors ${
                  brandTarget === mode.id
                    ? 'bg-background-color-3 text-font-color-black dark:bg-dark-background-color-3 dark:text-font-color-black font-medium'
                    : 'text-font-color-dimmed dark:text-dark-font-color-dimmed hover:opacity-100'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {/* Preset + Custom Icon Picker Grid */}
        <div className="mt-4">
          <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed mb-2 text-[11px] font-medium">
            {isDynamicActive
              ? 'Select Static Fallback Icon (used when playback stops or track has no album art):'
              : 'Select App Icon Preset or Custom Asset:'}
          </div>
          <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6 md:grid-cols-8">
            {/* Default Icon */}
            <button
              type="button"
              disabled={isBusy}
              onClick={() => handleApplyBrandSelection({ type: 'default' })}
              className={`group flex cursor-pointer flex-col items-center rounded-lg border p-2 transition-all ${
                isBrandOptionSelected({ type: 'default' })
                  ? 'border-font-color-highlight bg-background-color-3/25 dark:border-dark-font-color-highlight dark:bg-dark-background-color-3/25'
                  : 'border-transparent bg-black/5 hover:border-stone-400/40 dark:bg-white/5'
              }`}
              title="Default Nora Logo"
            >
              <img
                src={DefaultAppLogo}
                alt="Default"
                className="h-12 w-12 rounded-md object-contain p-1"
              />
              <span className="mt-1.5 w-full truncate text-center text-[11px] font-medium">
                Default
              </span>
              {isBrandOptionSelected({ type: 'default' }) && (
                <span
                  className={`mt-1 rounded px-1.5 py-0.5 text-[9px] font-medium ${
                    isDynamicActive
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {isDynamicActive ? 'Fallback' : 'Active'}
                </span>
              )}
            </button>

            {/* 11 Built-in Presets */}
            {APP_ICON_PRESETS.map((preset) => {
              const selected = isBrandOptionSelected({ type: 'preset', id: preset.id });
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleApplyBrandSelection({ type: 'preset', id: preset.id })}
                  className={`group flex cursor-pointer flex-col items-center rounded-lg border p-2 transition-all ${
                    selected
                      ? 'border-font-color-highlight bg-background-color-3/25 dark:border-dark-font-color-highlight dark:bg-dark-background-color-3/25'
                      : 'border-transparent bg-black/5 hover:border-stone-400/40 dark:bg-white/5'
                  }`}
                  title={preset.label}
                >
                  <img
                    src={preset.src}
                    alt={preset.label}
                    loading="lazy"
                    className="h-12 w-12 rounded-md object-contain"
                  />
                  <span className="mt-1.5 w-full truncate text-center text-[11px] font-medium">
                    {preset.label}
                  </span>
                  {selected && (
                    <span
                      className={`mt-1 rounded px-1.5 py-0.5 text-[9px] font-medium ${
                        isDynamicActive
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {isDynamicActive ? 'Fallback' : 'Active'}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Imported Custom Assets in Picker */}
            {config.customAssets.map((asset) => {
              const assetUrl = buildCustomAssetUrl(asset, customBaseUrl);
              const selected = isBrandOptionSelected({ type: 'custom', id: asset.id });
              return (
                <button
                  key={asset.id}
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleApplyBrandSelection({ type: 'custom', id: asset.id })}
                  className={`group relative flex cursor-pointer flex-col items-center rounded-lg border p-2 transition-all ${
                    selected
                      ? 'border-font-color-highlight bg-background-color-3/25 dark:border-dark-font-color-highlight dark:bg-dark-background-color-3/25'
                      : 'border-transparent bg-black/5 hover:border-stone-400/40 dark:bg-white/5'
                  }`}
                  title={`${asset.name} (${formatExtBadge(asset.ext)})`}
                >
                  <img
                    src={assetUrl || DefaultAppLogo}
                    alt={asset.name}
                    loading="lazy"
                    className="h-12 w-12 rounded-md object-contain"
                  />
                  <span className="mt-1.5 w-full truncate text-center text-[11px] font-medium">
                    {asset.name}
                  </span>
                  {selected && (
                    <span
                      className={`mt-1 rounded px-1.5 py-0.5 text-[9px] font-medium ${
                        isDynamicActive
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {isDynamicActive ? 'Fallback' : 'Active'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed mt-3 text-[11px]">
          Note: Dynamic song artwork updates at runtime across the in-app Title Bar, System Tray,
          Windows Taskbar badge overlay, and Alt+Tab window switcher. Pinned desktop and taskbar
          shortcuts retain their default executable icons as enforced by Windows Explorer.
        </p>
      </div>

      {/* Managed Custom Asset Library */}
      {config.customAssets.length > 0 && (
        <div className="bg-background-color-2/40 dark:bg-dark-background-color-2/40 mt-4 rounded-lg p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-xs font-semibold">
              Imported Custom Assets ({config.customAssets.length})
            </span>
            <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[11px]">
              Stored in userData/custom_assets/
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {config.customAssets.map((asset) => {
              const assetUrl = buildCustomAssetUrl(asset, customBaseUrl);
              return (
                <div
                  key={asset.id}
                  className="bg-background-color-1/70 dark:bg-dark-background-color-1/70 flex items-center justify-between gap-3 rounded-md p-2.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <img
                      src={assetUrl || DefaultAppLogo}
                      alt={asset.name}
                      className="h-10 w-10 shrink-0 rounded object-contain p-0.5"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium">{asset.name}</div>
                      <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[10px]">
                        {formatExtBadge(asset.ext)} &bull; {asset.width}&times;{asset.height} &bull;{' '}
                        {formatBytes(asset.sizeBytes)}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleDeleteCustomAsset(asset)}
                    title="Delete custom asset and unassign its slots"
                    className="cursor-pointer rounded px-2 py-1 text-xs text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Navigation & Empty-State Visual Slots */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setShowSlotMatrix((prev) => !prev)}
          className="bg-background-color-2 hover:bg-background-color-3 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3 flex cursor-pointer items-center gap-2 rounded-md px-3.5 py-2 text-xs font-medium transition-colors"
        >
          <span className="material-icons-round text-base leading-none">
            {showSlotMatrix ? 'expand_less' : 'tune'}
          </span>
          <span>
            {showSlotMatrix
              ? 'Hide Navigation & Empty-State Slot Assignments'
              : 'Customize Sidebar Navigation & Empty-State Slots'}
          </span>
        </button>

        {showSlotMatrix && (
          <div className="bg-background-color-2/40 dark:bg-dark-background-color-2/40 mt-3 space-y-4 rounded-lg p-4">
            <div>
              <div className="mb-2 text-xs font-semibold">Sidebar &amp; Navigation Icons</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {NAV_SLOT_DESCRIPTORS.map((meta) => {
                  const slotId = meta.id;
                  const currentAssignment = config.slots[slotId] ?? { type: 'default' };
                  const resolvedUrl = resolveVisualSlotUrl(slotId, config, customBaseUrl);
                  return (
                    <div
                      key={slotId}
                      className="bg-background-color-1/70 dark:bg-dark-background-color-1/70 flex items-center justify-between gap-2 rounded-md px-3 py-2"
                    >
                      <div className="flex items-center gap-2.5">
                        {resolvedUrl ? (
                          <img
                            src={resolvedUrl}
                            alt=""
                            className="h-5 w-5 shrink-0 object-contain"
                          />
                        ) : (
                          <span className="material-icons-round text-lg leading-none opacity-75">
                            {meta.defaultMaterialIcon}
                          </span>
                        )}
                        <span className="text-xs font-medium">{meta.label}</span>
                      </div>
                      <select
                        disabled={isBusy}
                        aria-label={`${meta.label} visual slot assignment`}
                        value={serializeAssignment(currentAssignment)}
                        onChange={(e) =>
                          handleAssignSlot(slotId, deserializeAssignment(e.target.value))
                        }
                        className="bg-background-color-2 dark:bg-dark-background-color-2 max-w-[10rem] rounded px-2 py-1 text-xs"
                      >
                        <option value="default">Default ({meta.defaultMaterialIcon})</option>
                        <optgroup label="Imported Custom Assets">
                          {config.customAssets.map((asset) => (
                            <option key={asset.id} value={`custom:${asset.id}`}>
                              {asset.name} ({formatExtBadge(asset.ext)})
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Built-in Presets">
                          {APP_ICON_PRESETS.map((preset) => (
                            <option key={preset.id} value={`preset:${preset.id}`}>
                              {preset.label}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold">Empty-State Illustrations</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {EMPTY_SLOT_DESCRIPTORS.map((meta) => {
                  const slotId = meta.id;
                  const currentAssignment = config.slots[slotId] ?? { type: 'default' };
                  const resolvedUrl = resolveVisualSlotUrl(slotId, config, customBaseUrl);
                  return (
                    <div
                      key={slotId}
                      className="bg-background-color-1/70 dark:bg-dark-background-color-1/70 flex items-center justify-between gap-2 rounded-md px-3 py-2"
                    >
                      <div className="flex items-center gap-2.5">
                        {resolvedUrl ? (
                          <img
                            src={resolvedUrl}
                            alt=""
                            className="h-5 w-5 shrink-0 object-contain"
                          />
                        ) : (
                          <span className="material-icons-round text-lg leading-none opacity-75">
                            image
                          </span>
                        )}
                        <span className="text-xs font-medium">{meta.label}</span>
                      </div>
                      <select
                        disabled={isBusy}
                        aria-label={`${meta.label} visual slot assignment`}
                        value={serializeAssignment(currentAssignment)}
                        onChange={(e) =>
                          handleAssignSlot(slotId, deserializeAssignment(e.target.value))
                        }
                        className="bg-background-color-2 dark:bg-dark-background-color-2 max-w-[10rem] rounded px-2 py-1 text-xs"
                      >
                        <option value="default">Default Illustration</option>
                        <optgroup label="Imported Custom Assets">
                          {config.customAssets.map((asset) => (
                            <option key={asset.id} value={`custom:${asset.id}`}>
                              {asset.name} ({formatExtBadge(asset.ext)})
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Built-in Presets">
                          {APP_ICON_PRESETS.map((preset) => (
                            <option key={preset.id} value={`preset:${preset.id}`}>
                              {preset.label}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </li>
  );
};

export default VisualAssetsSettings;
