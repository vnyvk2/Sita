import React from 'react';
import type { AvailableSearchProviderInfo } from '../../../../common/metadata/types';

export interface SearchCriteriaBarProps {
  album: string;
  artist: string;
  totalTracks: string;
  searchExpanded: boolean;
  selectedSource: string;
  availableProviders: AvailableSearchProviderInfo[];
  loading: boolean;
  onAlbumChange: (val: string) => void;
  onArtistChange: (val: string) => void;
  onTotalTracksChange: (val: string) => void;
  onSourceChange: (source: string) => void;
  onToggleExpanded: () => void;
  onSearch: () => void;
}

export const SearchCriteriaBar: React.FC<SearchCriteriaBarProps> = ({
  album,
  artist,
  totalTracks,
  searchExpanded,
  selectedSource,
  availableProviders,
  loading,
  onAlbumChange,
  onArtistChange,
  onTotalTracksChange,
  onSourceChange,
  onToggleExpanded,
  onSearch
}) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (album.trim()) {
      onSearch();
    }
  };

  return (
    <div
      className={`bg-background-color-2/40 dark:bg-dark-background-color-2/50 border border-background-color-2 dark:border-dark-background-color-2 rounded-xl transition-all flex flex-col gap-3 ${
        searchExpanded ? 'p-4' : 'px-4 py-3'
      }`}
    >
      {/* Collapsed Header Summary */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleExpanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleExpanded();
          }
        }}
        className="flex justify-between items-center cursor-pointer select-none"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold tracking-wider text-font-color-dimmed dark:text-dark-font-color-dimmed uppercase">
            {searchExpanded ? '▼ Search Criteria' : '▶ Search Criteria'}
          </span>
          {!searchExpanded && (
            <span className="text-sm text-font-color-dimmed dark:text-dark-font-color-dimmed">
              {artist ? <span className="text-font-color-black dark:text-font-color-white font-semibold">{artist} — </span> : ''}
              <span className="text-font-color-black dark:text-font-color-white font-semibold">{album || 'No Album'}</span>
              {totalTracks ? <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed font-medium"> · {totalTracks} tracks</span> : ''}
              <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs">
                {' '}· Source: {selectedSource === 'auto' ? 'Best Match' : selectedSource}
              </span>
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpanded();
          }}
          className="bg-background-color-2 hover:bg-background-color-3/40 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3/40 border border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-dimmed hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:text-font-color-white rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer"
        >
          {searchExpanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {/* Expanded Search Inputs Form */}
      {searchExpanded && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 pt-1">
          <div className="grid grid-cols-[1fr_1fr_120px_160px] gap-3 items-end">
            {/* Album Artist */}
            <div className="flex flex-col gap-1">
              <label htmlFor="autotag-artist-input" className="text-xs font-semibold text-font-color-dimmed dark:text-dark-font-color-dimmed tracking-wider uppercase">
                ALBUM ARTIST
              </label>
              <input
                id="autotag-artist-input"
                type="text"
                placeholder="e.g. Olivia Rodrigo"
                value={artist}
                onChange={(e) => onArtistChange(e.target.value)}
                className="px-3 py-2 rounded-lg bg-background-color-1 dark:bg-dark-background-color-1 border border-background-color-3/50 dark:border-dark-background-color-2 text-font-color-black dark:text-font-color-white text-sm outline-none focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight transition-colors placeholder:text-font-color-dimmed/50 dark:placeholder:text-dark-font-color-dimmed/50"
              />
            </div>

            {/* Album */}
            <div className="flex flex-col gap-1">
              <label htmlFor="autotag-album-input" className="text-xs font-semibold text-font-color-dimmed dark:text-dark-font-color-dimmed tracking-wider uppercase">
                ALBUM TITLE *
              </label>
              <input
                id="autotag-album-input"
                type="text"
                placeholder="e.g. SOUR"
                value={album}
                onChange={(e) => onAlbumChange(e.target.value)}
                required
                className="px-3 py-2 rounded-lg bg-background-color-1 dark:bg-dark-background-color-1 border border-background-color-3/50 dark:border-dark-background-color-2 text-font-color-black dark:text-font-color-white text-sm outline-none focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight transition-colors placeholder:text-font-color-dimmed/50 dark:placeholder:text-dark-font-color-dimmed/50"
              />
            </div>

            {/* Total Tracks */}
            <div className="flex flex-col gap-1">
              <label htmlFor="autotag-tracks-input" className="text-xs font-semibold text-font-color-dimmed dark:text-dark-font-color-dimmed tracking-wider uppercase">
                TRACKS
              </label>
              <input
                id="autotag-tracks-input"
                type="number"
                min="1"
                placeholder="e.g. 11"
                value={totalTracks}
                onChange={(e) => onTotalTracksChange(e.target.value)}
                className="px-3 py-2 rounded-lg bg-background-color-1 dark:bg-dark-background-color-1 border border-background-color-3/50 dark:border-dark-background-color-2 text-font-color-black dark:text-font-color-white text-sm outline-none focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight transition-colors text-center placeholder:text-font-color-dimmed/50 dark:placeholder:text-dark-font-color-dimmed/50"
              />
            </div>

            {/* Search Source Selector */}
            <div className="flex flex-col gap-1">
              <label htmlFor="autotag-source-select" className="text-xs font-semibold text-font-color-dimmed dark:text-dark-font-color-dimmed tracking-wider uppercase">
                SEARCH SOURCE
              </label>
              <select
                id="autotag-source-select"
                value={selectedSource}
                onChange={(e) => onSourceChange(e.target.value)}
                className="px-3 py-2 rounded-lg bg-background-color-1 dark:bg-dark-background-color-1 border border-background-color-3/50 dark:border-dark-background-color-2 text-font-color-black dark:text-font-color-white text-sm font-medium outline-none cursor-pointer focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight transition-colors"
              >
                <option value="auto">🌐 Best Match</option>
                {availableProviders.map((prov) => (
                  <option key={prov.id} value={prov.id}>
                    • {prov.displayName} Only
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Provider Architecture Description & Find Action */}
          <div className="flex justify-between items-center border-t border-background-color-2 dark:border-dark-background-color-2 pt-3">
            <div className="flex items-center gap-2 text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed">
              <span className="font-medium text-font-color-black dark:text-font-color-white">Discovery Strategy:</span>
              <span>{selectedSource === 'auto' ? 'Settings-driven multi-source ranking' : `Direct ${selectedSource} query`}</span>
              <span className="opacity-40">•</span>
              <span>
                Field Federation:{availableProviders.some((prov) => prov.id === 'discogs') ? ' Discogs Genres ·' : ''} CAA Artwork
              </span>
            </div>

            <button
              type="submit"
              disabled={loading || !album.trim()}
              className="px-5 py-2 rounded-lg bg-background-color-3 hover:bg-background-color-3/80 dark:bg-dark-background-color-3 dark:hover:bg-dark-background-color-3/80 text-font-color-black dark:text-font-color-white font-semibold text-sm transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Searching...' : '🔍 Search Releases'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

