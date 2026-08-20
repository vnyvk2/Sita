import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Button from '@renderer/components/Button';
import type { PlaylistImportPlan } from '../../../../../main/playlistImport/models/PlaylistImportPlan';
import type { SpotifyPlaylistSummary } from '../../../../../main/spotify/api/types';

interface SpotifyPlaylistImportModalProps {
  playlist: SpotifyPlaylistSummary | null;
  isOpen: boolean;
  onClose: () => void;
}

export const SpotifyPlaylistImportModal: React.FC<SpotifyPlaylistImportModalProps> = ({
  playlist,
  isOpen,
  onClose
}) => {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [plan, setPlan] = useState<PlaylistImportPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<boolean>(false);
  const [filter, setFilter] = useState<'all' | 'matched' | 'unmatched'>('all');

  useEffect(() => {
    let isCancelled = false;

    if (isOpen && playlist) {
      setIsLoading(true);
      setError(null);
      setPlan(null);
      setImportSuccess(false);
      setFilter('all');

      window.api.spotify
        .generateImportPlan(playlist.id)
        .then((generatedPlan) => {
          if (!isCancelled) {
            setPlan(generatedPlan as PlaylistImportPlan);
          }
        })
        .catch((err: unknown) => {
          if (!isCancelled) {
            setError(
              err instanceof Error
                ? err.message
                : 'Failed to generate playlist import plan from Spotify.'
            );
          }
        })
        .finally(() => {
          if (!isCancelled) {
            setIsLoading(false);
          }
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [isOpen, playlist]);

  if (!isOpen || !playlist) return null;

  const handleExecuteImport = async () => {
    if (!plan) return;
    try {
      setIsImporting(true);
      setError(null);
      await window.api.spotify.executeImportPlan(plan, { mode: 'create' });
      setImportSuccess(true);
      void queryClient.invalidateQueries({ queryKey: ['songPlaylists'] });
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Failed to execute Spotify playlist import.'
      );
    } finally {
      setIsImporting(false);
    }
  };

  const filteredEntries = (plan?.entries || []).filter((entry) => {
    if (filter === 'matched') return entry.decision === 'IMPORT';
    if (filter === 'unmatched') return entry.decision !== 'IMPORT';
    return true;
  });

  const matchedCount = plan?.statistics?.importedEntries ?? 0;
  const totalCount = plan?.statistics?.totalEntries ?? 0;
  const matchRate = plan?.statistics?.plannedImportPercentage ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="bg-background-color-1 dark:bg-dark-background-color-1 border-background-color-3/30 flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border shadow-2xl">
        {/* Header */}
        <div className="border-background-color-3/20 flex items-center justify-between border-b p-5">
          <div className="flex items-center gap-4">
            {playlist.imageUrl ? (
              <img
                src={playlist.imageUrl}
                alt={playlist.name}
                className="h-14 w-14 rounded-lg object-cover shadow"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-[#1DB954]/10 text-[#1DB954]">
                <span className="material-icons-round text-3xl">queue_music</span>
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-font-color-black dark:text-font-color-white text-xl font-bold">
                  {playlist.name}
                </h2>
                <a
                  href={`https://open.spotify.com/playlist/${encodeURIComponent(playlist.id)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#1DB954] hover:underline text-xs flex items-center gap-0.5"
                  title="Open in Spotify"
                >
                  <span className="material-icons-round text-xs">open_in_new</span>
                </a>
              </div>
              <p className="text-font-color-dim dark:text-dark-font-color-dim text-xs">
                Spotify Playlist • {playlist.tracksTotal} total items
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-font-color-dim hover:text-font-color-black dark:text-dark-font-color-dim dark:hover:text-font-color-white rounded-lg p-1"
          >
            <span className="material-icons-round text-2xl">close</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="material-icons-round animate-spin text-4xl text-[#1DB954]">
                sync
              </span>
              <p className="text-font-color-black dark:text-font-color-white mt-4 font-semibold">
                Inspecting Spotify Playlist & Matching Library...
              </p>
              <p className="text-font-color-dim dark:text-dark-font-color-dim mt-1 text-xs">
                Scanning ISRC, MBID, and high-confidence audio metadata
              </p>
            </div>
          )}

          {error && !isLoading && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-500">
              <div className="flex items-center gap-2 font-semibold">
                <span className="material-icons-round">error_outline</span>
                <span>Import Failed</span>
              </div>
              <p className="mt-1 text-sm">{error}</p>
            </div>
          )}

          {importSuccess && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 text-green-500">
                <span className="material-icons-round text-4xl">check</span>
              </div>
              <h3 className="text-font-color-black dark:text-font-color-white mt-4 text-lg font-bold">
                Playlist Successfully Imported!
              </h3>
              <p className="text-font-color-dim dark:text-dark-font-color-dim mt-1 text-sm">
                Created local playlist &quot;{playlist.name}&quot; with {matchedCount} matched tracks.
              </p>
              <div className="mt-6">
                <Button
                  label="Done"
                  iconName="check"
                  className="bg-[#1DB954]! text-white!"
                  clickHandler={onClose}
                />
              </div>
            </div>
          )}

          {plan && !isLoading && !importSuccess && (
            <div className="space-y-4">
              {/* Summary Stats Pill */}
              <div className="bg-background-color-2/60 dark:bg-dark-background-color-2/60 flex items-center justify-between rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold ${
                      matchRate >= 80
                        ? 'bg-green-500/20 text-green-500'
                        : matchRate >= 40
                          ? 'bg-yellow-500/20 text-yellow-500'
                          : 'bg-red-500/20 text-red-500'
                    }`}
                  >
                    {matchRate}%
                  </div>
                  <div>
                    <p className="text-font-color-black dark:text-font-color-white text-sm font-semibold">
                      {matchedCount} of {totalCount} Tracks Matched
                    </p>
                    <p className="text-font-color-dim dark:text-dark-font-color-dim text-xs">
                      {plan.statistics.notInLibraryEntries} missing locally
                      {plan.statistics.invalidEntries > 0 ? ` • ${plan.statistics.invalidEntries} unsupported media` : ''}
                      {plan.statistics.missingEntries > 0 ? ` • ${plan.statistics.missingEntries} unavailable` : ''}
                    </p>
                  </div>
                </div>

                {/* Filter Tabs */}
                <div className="flex rounded-lg bg-black/10 p-1 text-xs dark:bg-white/10">
                  <button
                    type="button"
                    onClick={() => setFilter('all')}
                    className={`rounded-md px-3 py-1 font-medium transition ${
                      filter === 'all'
                        ? 'bg-[#1DB954] text-white shadow'
                        : 'text-font-color-dim dark:text-dark-font-color-dim'
                    }`}
                  >
                    All ({totalCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter('matched')}
                    className={`rounded-md px-3 py-1 font-medium transition ${
                      filter === 'matched'
                        ? 'bg-[#1DB954] text-white shadow'
                        : 'text-font-color-dim dark:text-dark-font-color-dim'
                    }`}
                  >
                    Matched ({matchedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter('unmatched')}
                    className={`rounded-md px-3 py-1 font-medium transition ${
                      filter === 'unmatched'
                        ? 'bg-[#1DB954] text-white shadow'
                        : 'text-font-color-dim dark:text-dark-font-color-dim'
                    }`}
                  >
                    Missing ({totalCount - matchedCount})
                  </button>
                </div>
              </div>

              {/* Track-by-track list */}
              <div className="border-background-color-3/20 max-h-[45vh] overflow-y-auto rounded-xl border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-background-color-2/40 dark:bg-dark-background-color-2/40 text-font-color-dim sticky top-0 border-b border-black/5 dark:border-white/5">
                    <tr>
                      <th className="py-2.5 pr-2 pl-4">#</th>
                      <th className="py-2.5 pr-4 pl-2">Spotify Track</th>
                      <th className="py-2.5 pr-4 pl-2">Match Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 dark:divide-white/5">
                    {filteredEntries.map((entry) => {
                      const match = entry.source.trackReference.libraryMatch;
                      const isMatched = entry.decision === 'IMPORT';
                      const isVariantConflict =
                        match.diagnostics?.includes('VARIANT_CONFLICT');
                      const isLocalFile = match.diagnostics?.includes('SPOTIFY_LOCAL_FILE');
                      const isInvalid = entry.decision === 'SKIP_INVALID';
                      const isMissing = entry.decision === 'SKIP_MISSING';

                      let badgeText = 'Missing';
                      let badgeColor = 'bg-red-500/10 text-red-500 border-red-500/30';

                      if (isMatched) {
                        if (match.diagnostics?.includes('ISRC') || match.diagnostics?.includes('MBID')) {
                          badgeText = 'Authoritative ID';
                          badgeColor = 'bg-green-500/10 text-green-500 border-green-500/30';
                        } else if (match.diagnostics?.includes('HIGH_CONFIDENCE_METADATA')) {
                          badgeText = 'High Confidence';
                          badgeColor = 'bg-green-500/10 text-green-500 border-green-500/30';
                        } else {
                          badgeText = 'Fuzzy Match';
                          badgeColor = 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30';
                        }
                      } else if (isVariantConflict) {
                        badgeText = 'Variant Conflict';
                        badgeColor = 'bg-orange-500/10 text-orange-500 border-orange-500/30';
                      } else if (isLocalFile) {
                        badgeText = 'Local File';
                        badgeColor = 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30';
                      } else if (isInvalid) {
                        badgeText = 'Unsupported Media';
                        badgeColor = 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30';
                      } else if (isMissing) {
                        badgeText = 'Unavailable on Spotify';
                        badgeColor = 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30';
                      }

                      return (
                        <tr
                          key={entry.source.position}
                          className="hover:bg-black/5 dark:hover:bg-white/5"
                        >
                          <td className="py-2 pr-2 pl-4 text-font-color-dim dark:text-dark-font-color-dim font-mono">
                            {entry.source.position}
                          </td>
                          <td className="py-2 pr-4 pl-2">
                            <p className="text-font-color-black dark:text-font-color-white font-medium">
                              {entry.source.trackReference.resolvedTrack.track.title}
                            </p>
                            <p className="text-font-color-dim dark:text-dark-font-color-dim">
                              {entry.source.trackReference.resolvedTrack.track.artist || 'Unknown Artist'}
                            </p>
                          </td>
                          <td className="py-2 pr-4 pl-2">
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${badgeColor}`}
                            >
                              {badgeText}
                            </span>
                            {entry.notes && entry.notes.length > 0 && (
                              <p className="text-font-color-dim dark:text-dark-font-color-dim mt-0.5 text-[10px]">
                                {entry.notes[0]}
                              </p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {plan && !isLoading && !importSuccess && (
          <div className="border-background-color-3/20 flex items-center justify-between border-t p-4">
            <div className="text-font-color-dim dark:text-dark-font-color-dim text-xs">
              {matchedCount === 0
                ? 'No matching tracks found in your local Nora library.'
                : `Will create playlist with ${matchedCount} tracks in exact Spotify order.`}
            </div>
            <div className="flex items-center gap-3">
              <Button label="Cancel" clickHandler={onClose} />
              <Button
                label={
                  isImporting
                    ? 'Importing...'
                    : matchedCount === 0
                      ? 'No Tracks Matched'
                      : `Import ${matchedCount} Tracks`
                }
                iconName="download"
                className="bg-[#1DB954]! text-white!"
                clickHandler={handleExecuteImport}
                isDisabled={isImporting || matchedCount === 0}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
