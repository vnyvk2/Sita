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
    <div className="flex flex-col gap-4 text-font-color-black dark:text-font-color-white">
      <form onSubmit={handleSubmit} className="flex gap-2.5">
        <input
          type="text"
          placeholder="Album name..."
          value={album}
          onChange={(e) => setAlbum(e.target.value)}
          className="flex-1 px-3.5 py-2 rounded-lg bg-background-color-1 dark:bg-dark-background-color-2 border border-background-color-3/50 dark:border-dark-background-color-3/50 text-font-color-black dark:text-font-color-white placeholder:text-font-color-dimmed/60 dark:placeholder:text-dark-font-color-dimmed/60 outline-none text-sm focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight transition-colors"
        />
        <input
          type="text"
          placeholder="Artist name (optional)..."
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          className="flex-1 px-3.5 py-2 rounded-lg bg-background-color-1 dark:bg-dark-background-color-2 border border-background-color-3/50 dark:border-dark-background-color-3/50 text-font-color-black dark:text-font-color-white placeholder:text-font-color-dimmed/60 dark:placeholder:text-dark-font-color-dimmed/60 outline-none text-sm focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight transition-colors"
        />
        <button
          type="submit"
          disabled={loading || !album.trim()}
          className="px-5 py-2 rounded-lg bg-background-color-3 hover:bg-background-color-3/80 dark:bg-dark-background-color-3 dark:hover:bg-dark-background-color-3/80 text-font-color-black dark:text-font-color-white text-sm font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      <div className="flex flex-col gap-2.5 max-h-[420px] overflow-y-auto">
        {candidates.length === 0 && !loading && (
          <div className="p-7 text-center text-font-color-dimmed dark:text-dark-font-color-dimmed text-sm">
            No release candidates found. Search by album title and artist above.
          </div>
        )}

        {candidates.map((cand) => (
          <div
            key={cand.releaseId ?? cand.title}
            className="flex justify-between items-center px-4 py-3.5 rounded-xl bg-background-color-2/30 dark:bg-dark-background-color-2/40 border border-background-color-2 dark:border-dark-background-color-2 hover:bg-background-color-2/50 dark:hover:bg-dark-background-color-2/60 transition-colors"
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-base text-font-color-black dark:text-font-color-white">{cand.title}</span>
                {cand.year && (
                  <span className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed">({cand.year})</span>
                )}
              </div>
              <div className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed">
                {cand.artist} • {cand.trackCount ? `${cand.trackCount} Tracks` : 'Album'}
                {cand.releaseType && ` • ${cand.releaseType}`}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[0.7rem] px-2 py-0.5 rounded bg-background-color-2 dark:bg-dark-background-color-2 border border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-dimmed dark:text-dark-font-color-dimmed uppercase font-semibold">
                {cand.provider ?? 'musicbrainz'}
              </span>

              <button
                type="button"
                onClick={() => cand.releaseId && onSelectRelease(cand.releaseId, cand.provider ?? 'musicbrainz')}
                className="px-4 py-2 rounded-lg bg-background-color-2 hover:bg-background-color-3/40 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3/40 border border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-black dark:text-font-color-white text-xs font-semibold cursor-pointer transition-colors"
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

