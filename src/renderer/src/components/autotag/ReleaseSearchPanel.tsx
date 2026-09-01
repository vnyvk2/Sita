import React, { useState } from 'react';

import type { AlbumMetadata } from '../../../../common/metadata/types';

export interface ReleaseSearchPanelProps {
  initialAlbumName?: string;
  initialArtistName?: string;
  candidates: AlbumMetadata[];
  loading: boolean;
  onSearch: (album: string, artist?: string) => void;
  onSelectRelease: (releaseId: string, provider: string) => void;
}

export const ReleaseSearchPanel: React.FC<ReleaseSearchPanelProps> = ({
  initialAlbumName = '',
  initialArtistName = '',
  candidates,
  loading,
  onSearch,
  onSelectRelease
}) => {
  const [album, setAlbum] = useState(initialAlbumName);
  const [artist, setArtist] = useState(initialArtistName);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (album.trim()) {
      onSearch(album.trim(), artist.trim() || undefined);
    }
  };

  return (
    <div className="text-font-color-black dark:text-font-color-white flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex gap-2.5">
        <input
          type="text"
          placeholder="Album name..."
          value={album}
          onChange={(e) => setAlbum(e.target.value)}
          className="bg-background-color-1 dark:bg-dark-background-color-2 border-background-color-3/50 dark:border-dark-background-color-3/50 text-font-color-black dark:text-font-color-white placeholder:text-font-color-dimmed/60 dark:placeholder:text-dark-font-color-dimmed/60 focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight flex-1 rounded-lg border px-3.5 py-2 text-sm transition-colors outline-none"
        />
        <input
          type="text"
          placeholder="Artist name (optional)..."
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          className="bg-background-color-1 dark:bg-dark-background-color-2 border-background-color-3/50 dark:border-dark-background-color-3/50 text-font-color-black dark:text-font-color-white placeholder:text-font-color-dimmed/60 dark:placeholder:text-dark-font-color-dimmed/60 focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight flex-1 rounded-lg border px-3.5 py-2 text-sm transition-colors outline-none"
        />
        <button
          type="submit"
          disabled={loading || !album.trim()}
          className="bg-background-color-3 hover:bg-background-color-3/80 dark:bg-dark-background-color-3 dark:hover:bg-dark-background-color-3/80 text-font-color-black dark:text-font-color-white cursor-pointer rounded-lg px-5 py-2 text-sm font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      <div className="flex max-h-[420px] flex-col gap-2.5 overflow-y-auto">
        {candidates.length === 0 && !loading && (
          <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed p-7 text-center text-sm">
            No release candidates found. Search by album title and artist above.
          </div>
        )}

        {candidates.map((cand) => (
          <div
            key={cand.releaseId ?? cand.title}
            className="bg-background-color-2/30 dark:bg-dark-background-color-2/40 border-background-color-2 dark:border-dark-background-color-2 hover:bg-background-color-2/50 dark:hover:bg-dark-background-color-2/60 flex items-center justify-between rounded-xl border px-4 py-3.5 transition-colors"
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-font-color-black dark:text-font-color-white text-base font-semibold">
                  {cand.title}
                </span>
                {cand.year && (
                  <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs">
                    ({cand.year})
                  </span>
                )}
              </div>
              <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs">
                {cand.artist} • {cand.trackCount ? `${cand.trackCount} Tracks` : 'Album'}
                {cand.releaseType && ` • ${cand.releaseType}`}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="bg-background-color-2 dark:bg-dark-background-color-2 border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-dimmed dark:text-dark-font-color-dimmed rounded border px-2 py-0.5 text-[0.7rem] font-semibold uppercase">
                {cand.provider ?? 'musicbrainz'}
              </span>

              <button
                type="button"
                onClick={() =>
                  cand.releaseId && onSelectRelease(cand.releaseId, cand.provider ?? 'musicbrainz')
                }
                className="bg-background-color-2 hover:bg-background-color-3/40 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3/40 border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-black dark:text-font-color-white cursor-pointer rounded-lg border px-4 py-2 text-xs font-semibold transition-colors"
              >
                Select Release
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
