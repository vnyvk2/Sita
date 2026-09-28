export type SubFilterContext = 'songs' | 'playlist';

export type SubFilterToolId =
  | 'compactView'
  | 'language'
  | 'genre'
  | 'favoriteArtists'
  | 'favoriteAlbums'
  | 'clearDuplicates';

export interface ToolRenderProps {
  isCompact: boolean;
  onToggleCompact: () => void;
  language?: string;
  languageOptions?: { label: string; value: string }[];
  onLanguageChange?: (val: string) => void;
  genre?: string;
  genreOptions?: { label: string; value: string }[];
  onGenreChange?: (val: string) => void;
  onlyFavoriteArtists?: boolean;
  onToggleFavoriteArtists?: () => void;
  onlyFavoriteAlbums?: boolean;
  onToggleFavoriteAlbums?: () => void;
  onClearDuplicates?: () => void;
  isLibraryEmpty?: boolean;
}

export interface SubFilterToolDefinition {
  id: SubFilterToolId;
  labelKey: string;
  defaultLabel: string;
  icon: string;
  pinnedByDefault: boolean;
  contexts: SubFilterContext[];
}

export const SUB_FILTER_TOOLS: SubFilterToolDefinition[] = [
  {
    id: 'compactView',
    labelKey: 'common.compactView',
    defaultLabel: 'Compact View',
    icon: 'table_rows',
    pinnedByDefault: true,
    contexts: ['songs', 'playlist']
  },
  {
    id: 'language',
    labelKey: 'common.language',
    defaultLabel: 'Language',
    icon: 'translate',
    pinnedByDefault: true,
    contexts: ['songs', 'playlist']
  },
  {
    id: 'genre',
    labelKey: 'common.genre',
    defaultLabel: 'Genre',
    icon: 'music_note',
    pinnedByDefault: true,
    contexts: ['songs']
  },
  {
    id: 'favoriteArtists',
    labelKey: 'common.favArtists',
    defaultLabel: 'Fav Artists',
    icon: 'star',
    pinnedByDefault: false,
    contexts: ['songs']
  },
  {
    id: 'favoriteAlbums',
    labelKey: 'common.favAlbums',
    defaultLabel: 'Fav Albums',
    icon: 'album',
    pinnedByDefault: false,
    contexts: ['songs']
  },
  {
    id: 'clearDuplicates',
    labelKey: 'duplicateSongsPrompt.openButtonShort',
    defaultLabel: 'Clear Dups',
    icon: 'cleaning_services',
    pinnedByDefault: false,
    contexts: ['songs']
  }
];

export function getValidPinnedTools(
  context: SubFilterContext,
  storedTools?: string[]
): SubFilterToolId[] {
  const allowed = SUB_FILTER_TOOLS.filter((t) => t.contexts.includes(context));
  const allowedIds = new Set(allowed.map((t) => t.id));

  if (Array.isArray(storedTools)) {
    // If the user explicitly saved an empty array, honor their choice to have an empty pinned toolbar
    if (storedTools.length === 0) return [];

    const validSet = new Set(
      storedTools.filter((id): id is SubFilterToolId => allowedIds.has(id as SubFilterToolId))
    );
    if (validSet.size > 0) {
      return allowed.map((t) => t.id).filter((id) => validSet.has(id));
    }
  }

  return allowed.filter((t) => t.pinnedByDefault).map((t) => t.id);
}
