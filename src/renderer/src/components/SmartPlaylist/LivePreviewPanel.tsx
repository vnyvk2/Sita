import type { SmartPlaylistDefinition } from '@common/collections/smartPlaylist';
import { CollectionClient } from '@renderer/api/CollectionClient';
import calculateTimeFromSeconds from '@renderer/utils/calculateTimeFromSeconds';
import { useQuery } from '@tanstack/react-query';
import { memo, useEffect, useMemo, useState } from 'react';

interface LivePreviewPanelProps {
  definition: SmartPlaylistDefinition;
  maxEntries?: number | null;
  isValid: boolean;
}

function canonicalStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalStringify).join(',')}]`;
  }
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `"${k}":${canonicalStringify((obj as Record<string, unknown>)[k])}`).join(',')}}`;
}

export const LivePreviewPanel = memo(
  ({ definition, maxEntries, isValid }: LivePreviewPanelProps) => {
    const canonicalKey = useMemo(
      () => canonicalStringify({ definition, maxEntries: maxEntries ?? null }),
      [definition, maxEntries]
    );

    const [debouncedInput, setDebouncedInput] = useState(() => ({
      canonicalKey,
      definition,
      maxEntries
    }));

    useEffect(() => {
      const timer = setTimeout(() => {
        setDebouncedInput({ canonicalKey, definition, maxEntries });
      }, 300);
      return () => clearTimeout(timer);
    }, [canonicalKey, definition, maxEntries]);

    const isDebouncing = debouncedInput.canonicalKey !== canonicalKey;

    const {
      data: preview,
      isLoading,
      isFetching,
      isError
    } = useQuery({
      queryKey: ['smartPlaylist', 'preview', debouncedInput.canonicalKey],
      queryFn: () =>
        CollectionClient.previewSmartPlaylist(debouncedInput.definition, debouncedInput.maxEntries),
      enabled: isValid,
      staleTime: 5000,
      gcTime: 30000,
      placeholderData: (prev) => prev
    });

    const formattedDuration = useMemo(() => {
      if (!preview || preview.limitedDuration === undefined) return '';
      const { hours, minutes, seconds } = calculateTimeFromSeconds(preview.limitedDuration);
      if (hours > 0) return `${hours} hr ${minutes} min`;
      if (minutes > 0) return `${minutes} min ${seconds} sec`;
      return `${seconds} sec`;
    }, [preview]);

    return (
      <div className="bg-background-color-1/80 dark:bg-dark-background-color-1/80 flex h-full flex-col rounded-2xl border border-black/5 p-4 backdrop-blur-md dark:border-white/5">
        {/* Panel Header */}
        <div className="border-b border-black/5 pb-3 dark:border-white/5">
          <div className="flex items-center justify-between">
            <h3 className="text-font-color-black dark:text-font-color-white flex items-center gap-2 text-base font-bold">
              <span className="material-icons-round text-font-color-highlight text-lg">
                auto_awesome
              </span>
              Live Preview
              {(isFetching || isDebouncing) && (
                <span
                  title="Updating preview..."
                  className="bg-font-color-highlight inline-block h-2 w-2 animate-pulse rounded-full"
                />
              )}
            </h3>

            {preview && isValid && (
              <span className="text-font-color-black/60 dark:text-font-color-white/60 text-xs font-semibold">
                {formattedDuration}
              </span>
            )}
          </div>

          {/* Match Counts Copy */}
          {isValid && preview && (
            <p className="text-font-color-black/70 dark:text-font-color-white/70 mt-1 text-xs">
              {preview.totalMatches > preview.limitedMatches ? (
                <>
                  <strong className="text-font-color-black dark:text-font-color-white font-semibold">
                    {preview.totalMatches}
                  </strong>{' '}
                  matches (limited to top {preview.limitedMatches})
                </>
              ) : (
                <>
                  <strong className="text-font-color-black dark:text-font-color-white font-semibold">
                    {preview.totalMatches}
                  </strong>{' '}
                  matching {preview.totalMatches === 1 ? 'song' : 'songs'}
                </>
              )}
              {preview.limitedMatches > 100 && (
                <span className="text-font-color-black/50 dark:text-font-color-white/50 ml-1">
                  • showing first 100
                </span>
              )}
            </p>
          )}
        </div>

        {/* Content Area */}
        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          {!isValid ? (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center">
              <span className="material-icons-round text-font-color-black/30 dark:text-font-color-white/30 text-4xl">
                tune
              </span>
              <p className="text-font-color-black/60 dark:text-font-color-white/60 mt-2 text-sm font-medium">
                Complete rule criteria to see live preview
              </p>
            </div>
          ) : isLoading && !preview ? (
            <div className="flex h-full items-center justify-center p-6">
              <span className="material-icons-round text-font-color-highlight animate-spin text-2xl">
                refresh
              </span>
            </div>
          ) : isError ? (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center text-red-500">
              <span className="material-icons-round text-3xl">error_outline</span>
              <p className="mt-2 text-xs font-medium">Unable to evaluate current criteria</p>
            </div>
          ) : preview && preview.previewSongs.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center">
              <span className="material-icons-round text-font-color-black/30 dark:text-font-color-white/30 text-4xl">
                music_off
              </span>
              <p className="text-font-color-black/60 dark:text-font-color-white/60 mt-2 text-sm font-medium">
                No songs match these rules
              </p>
            </div>
          ) : (
            <div className="divide-y divide-black/5 dark:divide-white/5">
              {preview?.previewSongs.map((song, index) => {
                const artistNames =
                  song.artists && song.artists.length > 0
                    ? song.artists.map((a) => a.name).join(', ')
                    : 'Unknown Artist';
                const artwork = song.artworkPaths?.artworkPath;

                return (
                  <div
                    key={`${song.songId}-${index}`}
                    className="hover:bg-background-color-2/50 dark:hover:bg-dark-background-color-2/50 flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors"
                  >
                    <div className="bg-background-color-2 dark:bg-dark-background-color-2 relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md">
                      {artwork ? (
                        <img
                          src={`nora://localfiles/${artwork}`}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="material-icons-round text-font-color-black/40 dark:text-font-color-white/40 text-base">
                          music_note
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-font-color-black dark:text-font-color-white truncate text-xs font-semibold">
                        {song.title}
                      </p>
                      <p className="text-font-color-black/60 dark:text-font-color-white/60 truncate text-[11px]">
                        {artistNames}
                      </p>
                    </div>

                    <span className="text-font-color-black/50 dark:text-font-color-white/50 font-mono text-[11px]">
                      {calculateTimeFromSeconds(song.duration).minutes}:
                      {String(calculateTimeFromSeconds(song.duration).seconds).padStart(2, '0')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }
);

LivePreviewPanel.displayName = 'LivePreviewPanel';
