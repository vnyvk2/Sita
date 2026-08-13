export const SpecialPlaylists = {
  History: -1,
  Favorites: -2,
  RecentlyAdded: -3,
  isSpecialPlaylistId: (id: number) =>
    id === SpecialPlaylists.History ||
    id === SpecialPlaylists.Favorites ||
    id === SpecialPlaylists.RecentlyAdded
} as const;
