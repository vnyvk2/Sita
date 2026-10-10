import {
  NAV_ITEM_ID_TO_SLOT,
  normalizeVisualAssetsConfig,
  type CustomVisualAssetMeta,
  type VisualAssetsConfig,
  type VisualSlotAssignment,
  type VisualSlotId
} from '@common/visualSlots';
import { APP_ICON_PRESETS } from '@renderer/assets/app_icons';
import { settingsQuery } from '@renderer/queries/settings';
import { useQuery } from '@tanstack/react-query';
import { memo, useCallback, useEffect, useState, type ReactNode } from 'react';

const PRESET_SRC_BY_ID = new Map<string, string>(
  APP_ICON_PRESETS.map((preset) => [preset.id, preset.src])
);

export function buildCustomAssetUrl(
  asset: CustomVisualAssetMeta,
  customAssetsProtocolBaseUrl?: string
): string | undefined {
  if (!customAssetsProtocolBaseUrl || !asset?.fileName) return undefined;
  const base = customAssetsProtocolBaseUrl.replace(/\/+$/, '');
  return `${base}/${encodeURIComponent(asset.fileName)}?ts=${asset.createdAt || 0}`;
}

export function resolveVisualSlotUrl(
  slotId: VisualSlotId,
  rawConfig?: VisualAssetsConfig | null,
  customAssetsProtocolBaseUrl?: string
): string | undefined {
  const config = normalizeVisualAssetsConfig(rawConfig);
  const assignment: VisualSlotAssignment = config.slots[slotId] ?? { type: 'default' };

  if (assignment.type === 'default') {
    return undefined;
  }

  if (assignment.type === 'preset') {
    return PRESET_SRC_BY_ID.get(assignment.id);
  }

  if (assignment.type === 'custom') {
    const asset = config.customAssets.find((item) => item.id === assignment.id);
    if (!asset) return undefined;
    return buildCustomAssetUrl(asset, customAssetsProtocolBaseUrl);
  }

  return undefined;
}

/**
 * Resolves a single visual slot URL from the persisted user settings. Returns `undefined` when the
 * slot uses its default asset or if the assigned asset cannot be resolved, preserving the caller's
 * original default behavior.
 */
export function useVisualSlot(slotId: VisualSlotId): string | undefined {
  const { data: resolvedUrl } = useQuery({
    ...settingsQuery.all,
    select: useCallback(
      (data: UserSettings | undefined) =>
        resolveVisualSlotUrl(slotId, data?.visualAssetsConfig, data?.customAssetsProtocolBaseUrl),
      [slotId]
    )
  });

  return resolvedUrl;
}

/** Hook to retrieve the normalized visual assets configuration and custom assets base URL. */
export function useVisualAssetsState() {
  const { data } = useQuery({
    ...settingsQuery.all,
    select: useCallback(
      (settings: UserSettings | undefined) => ({
        config: normalizeVisualAssetsConfig(settings?.visualAssetsConfig),
        customAssetsProtocolBaseUrl: settings?.customAssetsProtocolBaseUrl
      }),
      []
    )
  });

  return { data };
}

interface CustomNavSlotIconProps {
  src: string;
  fallbackIcon: string;
}

export const CustomNavSlotIcon = memo(({ src, fallbackIcon }: CustomNavSlotIconProps) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  useEffect(() => {
    setFailedSrc(null);
  }, [src]);

  if (!src || failedSrc === src) {
    return (
      <span className="material-icons-round icon mr-5 text-2xl font-normal!">{fallbackIcon}</span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      onError={() => setFailedSrc(src)}
      className="icon mr-5 h-6 w-6 shrink-0 rounded-sm object-contain"
    />
  );
});

CustomNavSlotIcon.displayName = 'CustomNavSlotIcon';

/**
 * Hook for navigation containers (`Sidebar`, `NavigationPanel`) to resolve custom icons for `nav.*`
 * slots while preserving the exact default Material icon when no custom assignment exists.
 */
export function useNavVisualSlots() {
  const { data } = useQuery({
    ...settingsQuery.all,
    select: useCallback(
      (settings: UserSettings | undefined) => ({
        visualAssetsConfig: settings?.visualAssetsConfig,
        customAssetsProtocolBaseUrl: settings?.customAssetsProtocolBaseUrl
      }),
      []
    )
  });

  const getNavCustomIcon = useCallback(
    (navItemId: string, defaultIconName: string): ReactNode | undefined => {
      const slotId = NAV_ITEM_ID_TO_SLOT[navItemId];
      if (!slotId) return undefined;
      const url = resolveVisualSlotUrl(
        slotId,
        data?.visualAssetsConfig,
        data?.customAssetsProtocolBaseUrl
      );
      if (!url) return undefined;
      return <CustomNavSlotIcon src={url} fallbackIcon={defaultIconName} />;
    },
    [data?.visualAssetsConfig, data?.customAssetsProtocolBaseUrl]
  );

  return { getNavCustomIcon };
}
