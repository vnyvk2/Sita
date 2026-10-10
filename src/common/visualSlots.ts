/**
 * Shared Visual Slot & Custom Assets Registry for Nora.
 *
 * Separates visual assets (built-in presets and user-imported SVGs/PNGs/WebPs stored in
 * `<userData>/custom_assets/`) from the UI components and native Electron surfaces that display
 * them.
 */

export type VisualSlotCategory = 'brand' | 'nav' | 'empty';

export type BrandVisualSlotId = 'brand.appLogo' | 'brand.nativeIcon';

export type NavVisualSlotId =
  | 'nav.home'
  | 'nav.search'
  | 'nav.online'
  | 'nav.songs'
  | 'nav.playlists'
  | 'nav.folders'
  | 'nav.artists'
  | 'nav.albums'
  | 'nav.genres'
  | 'nav.insights'
  | 'nav.settings';

export type EmptyStateVisualSlotId =
  | 'empty.noSongs'
  | 'empty.noSearchResults'
  | 'empty.noPlaylists'
  | 'empty.noFavorites';

export type VisualSlotId = BrandVisualSlotId | NavVisualSlotId | EmptyStateVisualSlotId;

export type BuiltinVisualPresetId =
  | 'icon_01'
  | 'icon_02'
  | 'icon_03'
  | 'icon_04'
  | 'icon_05'
  | 'icon_08'
  | 'icon_10'
  | 'icon_13'
  | 'icon_15'
  | 'icon_18'
  | 'icon_19';

export const BUILTIN_VISUAL_PRESETS: readonly {
  id: BuiltinVisualPresetId;
  fileName: string;
  label: string;
}[] = [
  { id: 'icon_01', fileName: 'icon_01.png', label: 'Noir Earphones' },
  { id: 'icon_02', fileName: 'icon_02.png', label: 'Moonlight Vinyl' },
  { id: 'icon_03', fileName: 'icon_03.png', label: 'Studio Sketch' },
  { id: 'icon_04', fileName: 'icon_04.png', label: 'Retro Monitor' },
  { id: 'icon_05', fileName: 'icon_05.png', label: 'Street Cap' },
  { id: 'icon_08', fileName: 'icon_08.png', label: 'Acoustic Reverie' },
  { id: 'icon_10', fileName: 'icon_10.png', label: 'Cyber Booth' },
  { id: 'icon_13', fileName: 'icon_13.png', label: 'Hoodie Beats' },
  { id: 'icon_15', fileName: 'icon_15.png', label: 'Minimal Silhouette' },
  { id: 'icon_18', fileName: 'icon_18.png', label: 'Golden Hour Lo-Fi' },
  { id: 'icon_19', fileName: 'icon_19.png', label: 'Warm Knit Sessions' }
] as const;

export type VisualSlotAssignment =
  | { type: 'default' }
  | { type: 'preset'; id: BuiltinVisualPresetId }
  | { type: 'custom'; id: string };

export interface CustomVisualAssetMeta {
  /** Stable managed asset identifier, e.g. `asset-a1b2c3d4` */
  id: string;
  /** Human-readable name derived from the imported file */
  name: string;
  /** Validated MIME type */
  mimeType: 'image/png' | 'image/webp' | 'image/svg+xml';
  /** Managed file extension */
  ext: '.png' | '.webp' | '.svg';
  /** Filename inside `<userData>/custom_assets/assets/` for UI display */
  fileName: string;
  /** 512x512 PNG filename inside `<userData>/custom_assets/assets/` for native Electron surfaces */
  nativeFileName: string;
  /** Normalized or intrinsic width */
  width: number;
  /** Normalized or intrinsic height */
  height: number;
  /** Stored file size in bytes */
  sizeBytes: number;
  /** Unix epoch ms when imported */
  createdAt: number;
}

export interface VisualAssetsConfig {
  slots: Partial<Record<VisualSlotId, VisualSlotAssignment>>;
  customAssets: CustomVisualAssetMeta[];
  /** When enabled, the app icon dynamically reflects current playing song artwork */
  dynamicNowPlayingIcon?: boolean;
}

export const DEFAULT_VISUAL_ASSETS_CONFIG: VisualAssetsConfig = {
  slots: {},
  customAssets: [],
  dynamicNowPlayingIcon: false
};

export interface VisualSlotDescriptor {
  id: VisualSlotId;
  category: VisualSlotCategory;
  label: string;
  description: string;
  recommendedSize: string;
  /** Default Material icon glyph name for `nav.*` slots */
  defaultMaterialIcon?: string;
  /** Whether built-in square app icon presets are directly selectable for this slot */
  supportsAppIconPresets: boolean;
}

export const VISUAL_SLOT_REGISTRY: readonly VisualSlotDescriptor[] = [
  // Branding slots
  {
    id: 'brand.appLogo',
    category: 'brand',
    label: 'In-App Logo',
    description: 'Displayed in the Title Bar, About page, and startup preloader.',
    recommendedSize: '512×512 px',
    supportsAppIconPresets: true
  },
  {
    id: 'brand.nativeIcon',
    category: 'brand',
    label: 'Running App & Tray Icon',
    description:
      'Updates the running window icon, system tray, and macOS Dock at runtime (packaged executable & pinned OS shortcuts retain their installer icon).',
    recommendedSize: '512×512 px',
    supportsAppIconPresets: true
  },

  // Navigation slots
  {
    id: 'nav.home',
    category: 'nav',
    label: 'Home Icon',
    description: 'Sidebar & navigation panel icon for Home.',
    recommendedSize: '24×24 px',
    defaultMaterialIcon: 'home',
    supportsAppIconPresets: false
  },
  {
    id: 'nav.search',
    category: 'nav',
    label: 'Search Icon',
    description: 'Sidebar & navigation panel icon for Search.',
    recommendedSize: '24×24 px',
    defaultMaterialIcon: 'search',
    supportsAppIconPresets: false
  },
  {
    id: 'nav.online',
    category: 'nav',
    label: 'Online Icon',
    description: 'Sidebar & navigation panel icon for Online.',
    recommendedSize: '24×24 px',
    defaultMaterialIcon: 'cloud_download',
    supportsAppIconPresets: false
  },
  {
    id: 'nav.songs',
    category: 'nav',
    label: 'Songs Icon',
    description: 'Sidebar & navigation panel icon for Songs.',
    recommendedSize: '24×24 px',
    defaultMaterialIcon: 'music_note',
    supportsAppIconPresets: false
  },
  {
    id: 'nav.playlists',
    category: 'nav',
    label: 'Playlists Icon',
    description: 'Sidebar & navigation panel icon for Playlists.',
    recommendedSize: '24×24 px',
    defaultMaterialIcon: 'queue_music',
    supportsAppIconPresets: false
  },
  {
    id: 'nav.folders',
    category: 'nav',
    label: 'Folders Icon',
    description: 'Sidebar & navigation panel icon for Folders.',
    recommendedSize: '24×24 px',
    defaultMaterialIcon: 'folder',
    supportsAppIconPresets: false
  },
  {
    id: 'nav.artists',
    category: 'nav',
    label: 'Artists Icon',
    description: 'Sidebar & navigation panel icon for Artists.',
    recommendedSize: '24×24 px',
    defaultMaterialIcon: 'people',
    supportsAppIconPresets: false
  },
  {
    id: 'nav.albums',
    category: 'nav',
    label: 'Albums Icon',
    description: 'Sidebar & navigation panel icon for Albums.',
    recommendedSize: '24×24 px',
    defaultMaterialIcon: 'album',
    supportsAppIconPresets: false
  },
  {
    id: 'nav.genres',
    category: 'nav',
    label: 'Genres Icon',
    description: 'Sidebar & navigation panel icon for Genres.',
    recommendedSize: '24×24 px',
    defaultMaterialIcon: 'style',
    supportsAppIconPresets: false
  },
  {
    id: 'nav.insights',
    category: 'nav',
    label: 'Insights Icon',
    description: 'Sidebar & navigation panel icon for Insights.',
    recommendedSize: '24×24 px',
    defaultMaterialIcon: 'auto_graph',
    supportsAppIconPresets: false
  },
  {
    id: 'nav.settings',
    category: 'nav',
    label: 'Settings Icon',
    description: 'Sidebar & navigation panel icon for Settings.',
    recommendedSize: '24×24 px',
    defaultMaterialIcon: 'settings',
    supportsAppIconPresets: false
  },

  // Empty-state illustration slots
  {
    id: 'empty.noSongs',
    category: 'empty',
    label: 'Empty Songs Illustration',
    description: 'Illustration shown when the song library is empty.',
    recommendedSize: '256×256 px',
    supportsAppIconPresets: false
  },
  {
    id: 'empty.noSearchResults',
    category: 'empty',
    label: 'No Search Results Illustration',
    description: 'Illustration shown when a search matches no items.',
    recommendedSize: '256×256 px',
    supportsAppIconPresets: false
  },
  {
    id: 'empty.noPlaylists',
    category: 'empty',
    label: 'Empty Playlists Illustration',
    description: 'Illustration shown when no playlists exist.',
    recommendedSize: '256×256 px',
    supportsAppIconPresets: false
  },
  {
    id: 'empty.noFavorites',
    category: 'empty',
    label: 'Empty Favorites Illustration',
    description: 'Illustration shown when no favorite songs are marked.',
    recommendedSize: '256×256 px',
    supportsAppIconPresets: false
  }
] as const;

export const VISUAL_SLOT_IDS_SET: ReadonlySet<VisualSlotId> = new Set(
  VISUAL_SLOT_REGISTRY.map((slot) => slot.id)
);

export const BUILTIN_PRESET_IDS_SET: ReadonlySet<BuiltinVisualPresetId> = new Set(
  BUILTIN_VISUAL_PRESETS.map((preset) => preset.id)
);

export const NAV_ITEM_ID_TO_SLOT: Readonly<Record<string, NavVisualSlotId>> = {
  Home: 'nav.home',
  Search: 'nav.search',
  Online: 'nav.online',
  Songs: 'nav.songs',
  Playlists: 'nav.playlists',
  Folders: 'nav.folders',
  Artists: 'nav.artists',
  Albums: 'nav.albums',
  Genres: 'nav.genres',
  Insights: 'nav.insights',
  Settings: 'nav.settings'
};

export function isValidVisualSlotId(value: unknown): value is VisualSlotId {
  return typeof value === 'string' && VISUAL_SLOT_IDS_SET.has(value as VisualSlotId);
}

export function isValidBuiltinPresetId(value: unknown): value is BuiltinVisualPresetId {
  return typeof value === 'string' && BUILTIN_PRESET_IDS_SET.has(value as BuiltinVisualPresetId);
}

export function isValidCustomAssetId(value: unknown): value is string {
  return typeof value === 'string' && /^asset-[a-z0-9_-]{4,64}$/i.test(value);
}

export function normalizeVisualAssetsConfig(raw: unknown): VisualAssetsConfig {
  if (!raw || typeof raw !== 'object') {
    return { slots: {}, customAssets: [] };
  }

  const candidate = raw as Partial<VisualAssetsConfig>;
  const customAssets: CustomVisualAssetMeta[] = [];
  const validCustomIds = new Set<string>();

  if (Array.isArray(candidate.customAssets)) {
    for (const item of candidate.customAssets) {
      if (
        item &&
        typeof item === 'object' &&
        isValidCustomAssetId(item.id) &&
        typeof item.name === 'string' &&
        (item.mimeType === 'image/png' ||
          item.mimeType === 'image/webp' ||
          item.mimeType === 'image/svg+xml') &&
        (item.ext === '.png' || item.ext === '.webp' || item.ext === '.svg') &&
        typeof item.fileName === 'string' &&
        !item.fileName.includes('..') &&
        !item.fileName.includes('/') &&
        !item.fileName.includes('\\') &&
        typeof item.nativeFileName === 'string' &&
        !item.nativeFileName.includes('..') &&
        !item.nativeFileName.includes('/') &&
        !item.nativeFileName.includes('\\')
      ) {
        customAssets.push({
          id: item.id,
          name: item.name.slice(0, 120),
          mimeType: item.mimeType,
          ext: item.ext,
          fileName: item.fileName,
          nativeFileName: item.nativeFileName,
          width: typeof item.width === 'number' && Number.isFinite(item.width) ? item.width : 512,
          height:
            typeof item.height === 'number' && Number.isFinite(item.height) ? item.height : 512,
          sizeBytes:
            typeof item.sizeBytes === 'number' && Number.isFinite(item.sizeBytes)
              ? item.sizeBytes
              : 0,
          createdAt:
            typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
              ? item.createdAt
              : Date.now()
        });
        validCustomIds.add(item.id);
      }
    }
  }

  const slots: Partial<Record<VisualSlotId, VisualSlotAssignment>> = {};
  if (candidate.slots && typeof candidate.slots === 'object') {
    for (const [slotKey, assignment] of Object.entries(candidate.slots)) {
      if (!isValidVisualSlotId(slotKey) || !assignment || typeof assignment !== 'object') {
        continue;
      }
      if (assignment.type === 'default') {
        continue;
      }
      if (assignment.type === 'preset' && isValidBuiltinPresetId(assignment.id)) {
        slots[slotKey] = { type: 'preset', id: assignment.id };
      } else if (
        assignment.type === 'custom' &&
        isValidCustomAssetId(assignment.id) &&
        validCustomIds.has(assignment.id)
      ) {
        slots[slotKey] = { type: 'custom', id: assignment.id };
      }
    }
  }

  const dynamicNowPlayingIcon =
    typeof candidate.dynamicNowPlayingIcon === 'boolean' ? candidate.dynamicNowPlayingIcon : false;

  return { slots, customAssets, dynamicNowPlayingIcon };
}
