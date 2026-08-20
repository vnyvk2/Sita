import React, { useEffect, useState } from 'react';
import Button from '@renderer/components/Button';
import type {
  SpotifyExportResult,
  SpotifyPlaylistExportPlan
} from '../../../../main/spotify/api/types';

interface SpotifyPlaylistExportModalProps {
  playlistId: number;
  playlistName: string;
  isOpen: boolean;
  onClose: () => void;
}

export const SpotifyPlaylistExportModal: React.FC<SpotifyPlaylistExportModalProps> = ({
  playlistId,
  playlistName,
  isOpen,
  onClose
}) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [hasPermission, setHasPermission] = useState<boolean>(true);
  const [plan, setPlan] = useState<SpotifyPlaylistExportPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<SpotifyExportResult | null>(null);
  const [exportName, setExportName] = useState<string>(playlistName);
  const [description, setDescription] = useState<string>('Exported from Nora');
  const [isPublic, setIsPublic] = useState<boolean>(false);
  const [filter, setFilter] = useState<'all' | 'exportable' | 'unmatched'>('all');

  useEffect(() => {
    let isCancelled = false;

    if (isOpen && playlistId) {
      setIsLoading(true);
      setError(null);
      setPlan(null);
      setExportResult(null);
      setExportName(playlistName);
      setFilter('all');

      // Generate preview plan
      window.api.spotify
        .generateExportPlan(playlistId)
        .then((generatedPlan) => {
          if (!isCancelled) {
            setPlan(generatedPlan as SpotifyPlaylistExportPlan);
            if (generatedPlan.playlistName) {
              setExportName(generatedPlan.playlistName);
            }
          }
        })
        .catch((err: unknown) => {
          if (!isCancelled) {
            setError(
              err instanceof Error
                ? err.message
                : 'Failed to generate Spotify export preview.'
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
  }, [isOpen, playlistId, playlistName]);

  useEffect(() => {
    let isCancelled = false;
    if (isOpen) {
      window.api.spotify
        .hasExportPermissions(isPublic)
        .then((permitted) => {
          if (!isCancelled) setHasPermission(Boolean(permitted));
        })
        .catch(() => {
          if (!isCancelled) setHasPermission(false);
        });
    }
    return () => {
      isCancelled = true;
    };
  }, [isOpen, isPublic]);

  if (!isOpen) return null;

  const handleReconnect = async () => {
    try {
      setIsLoading(true);
      await window.api.spotify.connect();
      const permitted = await window.api.spotify.hasExportPermissions(isPublic);
      setHasPermission(Boolean(permitted));
      const freshPlan = await window.api.spotify.generateExportPlan(playlistId);
      setPlan(freshPlan as SpotifyPlaylistExportPlan);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Spotify reconnection failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteExport = async () => {
    if (!plan) return;

    try {
      setIsExporting(true);
      setError(null);

      const result = await window.api.spotify.executeExport({
        playlistId: plan.playlistId,
        name: exportName.trim() || plan.playlistName,
        description: description.trim() || undefined,
        isPublic,
        revision: plan.revision
      });

      setExportResult(result as SpotifyExportResult);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to export playlist to Spotify.');
    } finally {
      setIsExporting(false);
    }
  };

  const filteredEntries = plan?.entries.filter((entry) => {
    if (filter === 'exportable') return entry.decision === 'EXPORT';
    if (filter === 'unmatched') return entry.decision !== 'EXPORT';
    return true;
  });

  const exportableCount = plan?.statistics.exportableEntries ?? 0;
  const totalCount = plan?.statistics.totalEntries ?? 0;
  const matchPercentage = plan?.statistics.plannedExportPercentage ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      style={{ animation: 'fadeIn 0.2s ease-out' }}
    >
      <div className="relative flex flex-col w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl border border-zinc-700/60 bg-[#161722] text-zinc-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700/40 bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400">
              <span className="material-symbols-rounded text-2xl font-normal leading-none select-none">
                upload
              </span>
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-zinc-100">
                Export &quot;{playlistName}&quot; to Spotify
              </h2>
              <p className="text-xs text-zinc-400">
                Matches local tracks against Spotify&apos;s global catalog and creates a remote playlist.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="p-2 text-zinc-400 transition-colors rounded-lg hover:bg-zinc-800 hover:text-zinc-200"
          >
            <span className="material-symbols-rounded text-xl font-normal leading-none select-none">
              close
            </span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-5">
          {/* Permission warning banner */}
          {!hasPermission && !isLoading && (
            <div className="flex items-center justify-between p-4 border rounded-xl border-amber-500/30 bg-amber-500/10 text-amber-300">
              <div className="flex items-center gap-3">
                <span className="material-symbols-rounded text-xl font-normal leading-none select-none">
                  lock_open
                </span>
                <span className="text-sm">
                  Spotify write permissions needed to create remote playlists. Reconnect to upgrade.
                </span>
              </div>
              <Button
                label="Reconnect Spotify"
                clickHandler={handleReconnect}
                className="text-xs !py-1.5 !px-3 !bg-amber-500 !text-black !font-semibold hover:!bg-amber-400"
              />
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16 space-y-3 text-zinc-400">
              <div className="w-8 h-8 border-2 rounded-full animate-spin border-emerald-500 border-t-transparent" />
              <p className="text-sm">Searching Spotify catalog and scoring candidates...</p>
            </div>
          )}

          {/* Error Message */}
          {error && !isLoading && (
            <div className="p-4 border rounded-xl border-red-500/30 bg-red-500/10 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Export Success View */}
          {exportResult && !isLoading && (
            <div className="flex flex-col items-center justify-center py-10 space-y-4 text-center">
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400">
                <span className="material-symbols-rounded text-3xl font-normal leading-none select-none">
                  check_circle
                </span>
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-zinc-100">
                  {exportResult.status === 'SUCCESS'
                    ? 'Playlist Exported Successfully!'
                    : 'Partial Export Completed'}
                </h3>
                <p className="text-sm text-zinc-400">
                  {exportResult.status === 'SUCCESS'
                    ? `Added all ${exportableCount} matched tracks in ${exportResult.totalBatches} batch(es).`
                    : `Completed ${exportResult.completedBatches}/${exportResult.totalBatches} batches. ${exportResult.error || ''}`}
                </p>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <a
                  href={exportResult.playlistUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 text-sm font-semibold rounded-xl bg-emerald-500 text-black hover:bg-emerald-400 transition-colors flex items-center gap-2"
                >
                  <span className="material-symbols-rounded text-lg font-normal leading-none select-none">
                    open_in_new
                  </span>
                  Open in Spotify Web
                </a>
                <Button label="Done" clickHandler={onClose} className="text-sm !py-2 !px-4" />
              </div>
            </div>
          )}

          {/* Preview & Configuration */}
          {!isLoading && !exportResult && plan && (
            <div className="space-y-5">
              {/* Configuration Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl border border-zinc-700/40 bg-zinc-900/30">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Spotify Playlist Name</label>
                  <input
                    type="text"
                    value={exportName}
                    onChange={(e) => setExportName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Visibility</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsPublic(false)}
                      className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                        !isPublic
                          ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                          : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Private (Default)
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsPublic(true)}
                      className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                        isPublic
                          ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                          : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Public
                    </button>
                  </div>
                </div>
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Description (Optional)</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Statistics & Filter Tabs */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-zinc-700/40 bg-zinc-900/30">
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-400">{matchPercentage}%</div>
                    <div className="text-[11px] text-zinc-400 uppercase tracking-wider">Matched</div>
                  </div>
                  <div className="h-8 w-px bg-zinc-700/50" />
                  <div className="text-xs text-zinc-300 space-y-0.5">
                    <div>
                      <span className="font-semibold text-emerald-400">{exportableCount}</span> of{' '}
                      <span className="font-semibold">{totalCount}</span> tracks exportable
                    </div>
                    {plan.statistics.variantConflictEntries > 0 && (
                      <div className="text-amber-400">
                        {plan.statistics.variantConflictEntries} skipped on variant conflict
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 p-1 rounded-lg bg-zinc-800/80 border border-zinc-700/50">
                  <button
                    type="button"
                    onClick={() => setFilter('all')}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                      filter === 'all'
                        ? 'bg-zinc-700 text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    All ({plan.entries.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter('exportable')}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                      filter === 'exportable'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Exportable ({exportableCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter('unmatched')}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                      filter === 'unmatched'
                        ? 'bg-zinc-700 text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Unmatched ({totalCount - exportableCount})
                  </button>
                </div>
              </div>

              {/* Track Table */}
              <div className="border rounded-xl border-zinc-700/40 bg-zinc-900/20 overflow-hidden">
                <div className="max-h-64 overflow-y-auto divide-y divide-zinc-800/50">
                  {filteredEntries?.map((entry) => (
                    <div
                      key={entry.position}
                      className="flex items-center justify-between p-3 text-xs hover:bg-zinc-800/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <span className="w-6 text-center text-zinc-500 font-mono text-[11px]">
                          {entry.position}
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium text-zinc-200 truncate">{entry.title}</div>
                          <div className="text-zinc-400 truncate">
                            {entry.artists.join(', ') || 'Unknown Artist'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {entry.decision === 'EXPORT' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            {entry.resolution.matchResult?.isAuthoritative
                              ? 'Authoritative ID'
                              : 'Matched'}
                          </span>
                        ) : entry.decision === 'SKIP_VARIANT_CONFLICT' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            Variant Conflict
                          </span>
                        ) : entry.decision === 'SKIP_SEARCH_FAILED' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            Search Failed
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">
                            Not in Catalog
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!exportResult && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-700/40 bg-zinc-900/40">
            <Button
              label="Cancel"
              clickHandler={onClose}
              isDisabled={isExporting}
              className="text-xs !py-2 !px-4"
            />
            <Button
              label={
                isExporting
                  ? 'Exporting...'
                  : exportableCount === 0
                  ? 'No Tracks Matched'
                  : `Export ${exportableCount} Tracks to Spotify`
              }
              clickHandler={handleExecuteExport}
              isDisabled={isExporting || exportableCount === 0 || isLoading || !hasPermission}
              className={`text-xs !py-2 !px-5 !font-semibold ${
                exportableCount > 0 && hasPermission
                  ? '!bg-emerald-500 !text-black hover:!bg-emerald-400'
                  : ''
              }`}
            />
          </div>
        )}
      </div>
    </div>
  );
};
export default SpotifyPlaylistExportModal;
