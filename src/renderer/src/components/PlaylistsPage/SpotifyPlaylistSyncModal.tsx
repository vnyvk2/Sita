import React, { useEffect, useState } from 'react';
import Button from '@renderer/components/Button';
import type {
  SpotifyPlaylistSyncPlan,
  SpotifySyncDriftStatus,
  SpotifySyncResult,
  SyncStrategy
} from '../../../../main/spotify/api/types';

interface SpotifyPlaylistSyncModalProps {
  playlistId: number;
  playlistName: string;
  isOpen: boolean;
  onClose: () => void;
  onSyncComplete?: () => void;
}

export const SpotifyPlaylistSyncModal: React.FC<SpotifyPlaylistSyncModalProps> = ({
  playlistId,
  playlistName,
  isOpen,
  onClose,
  onSyncComplete
}) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [driftStatus, setDriftStatus] = useState<SpotifySyncDriftStatus | null>(null);
  const [strategy, setStrategy] = useState<SyncStrategy>('UNION_MERGE');
  const [plan, setPlan] = useState<SpotifyPlaylistSyncPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SpotifySyncResult | null>(null);

  useEffect(() => {
    let isCancelled = false;

    if (isOpen && playlistId) {
      setIsLoading(true);
      setError(null);
      setPlan(null);
      setSyncResult(null);
      setDriftStatus(null);

      // 1. Detect drift status
      window.api.spotify
        .detectDrift(playlistId)
        .then((drift: unknown) => {
          if (!isCancelled) {
            const typedDrift = drift as SpotifySyncDriftStatus;
            setDriftStatus(typedDrift);

            // 2. Generate plan for selected strategy
            return window.api.spotify.generateSyncPlan(playlistId, strategy);
          }
          return null;
        })
        .then((generatedPlan: unknown) => {
          if (!isCancelled && generatedPlan) {
            setPlan(generatedPlan as SpotifyPlaylistSyncPlan);
          }
        })
        .catch((err: unknown) => {
          if (!isCancelled) {
            setError(
              err instanceof Error
                ? err.message
                : 'Failed to inspect playlist synchronization state.'
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
  }, [isOpen, playlistId, strategy]);

  const handleStrategyChange = (newStrategy: SyncStrategy) => {
    setStrategy(newStrategy);
  };

  const handleExecuteSync = async () => {
    if (!playlistId || isSyncing) return;

    try {
      setIsSyncing(true);
      setError(null);

      const result = (await window.api.spotify.executeSync(
        playlistId,
        strategy
      )) as SpotifySyncResult;

      setSyncResult(result);

      if (result.status === 'SUCCESS' && onSyncComplete) {
        onSyncComplete();
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'An error occurred during playlist synchronization.'
      );
    } finally {
      setIsSyncing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-white/10 bg-[#161722] text-white shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 bg-[#1a1b2a]">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1DB954]/20 text-[#1DB954]">
              <span className="material-symbols-rounded text-2xl">sync_alt</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-wide text-white">
                Spotify Synchronizer
              </h2>
              <p className="text-xs text-white/60">
                Two-way snapshot reconciliation for &ldquo;{playlistName}&rdquo;
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white transition-colors"
          >
            <span className="material-symbols-rounded">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1DB954] border-t-transparent" />
              <p className="text-sm text-white/70">Evaluating playlist drift and 3-way diff...</p>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300 flex items-start space-x-3">
              <span className="material-symbols-rounded text-red-400">error</span>
              <div>
                <p className="font-semibold text-red-200">Synchronization Error</p>
                <p className="mt-1">{error}</p>
              </div>
            </div>
          )}

          {syncResult && (
            <div
              className={`rounded-lg border p-5 ${
                syncResult.status === 'SUCCESS'
                  ? 'border-green-500/30 bg-green-500/10 text-green-200'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
              }`}
            >
              <div className="flex items-center space-x-3">
                <span className="material-symbols-rounded text-2xl">
                  {syncResult.status === 'SUCCESS' ? 'check_circle' : 'warning'}
                </span>
                <div>
                  <h3 className="text-base font-semibold">
                    {syncResult.status === 'SUCCESS'
                      ? 'Synchronization Complete!'
                      : 'Partial Synchronization Completed'}
                  </h3>
                  <p className="text-xs text-white/80 mt-1">
                    {syncResult.status === 'SUCCESS'
                      ? 'Local Nora playlist and remote Spotify playlist are now fully aligned.'
                      : `Remote batches completed: ${syncResult.completedRemoteBatches}/${syncResult.totalRemoteBatches}. Error: ${syncResult.error}`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {!isLoading && !syncResult && driftStatus && plan && (
            <>
              {/* Drift Status Banner */}
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-[#1c1e2e] p-4">
                <div className="flex items-center space-x-3">
                  <span
                    className={`inline-flex h-3 w-3 rounded-full ${
                      driftStatus.driftState === 'IN_SYNC'
                        ? 'bg-green-400 animate-pulse'
                        : driftStatus.driftState === 'NEEDS_RECOVERY'
                          ? 'bg-red-400 animate-ping'
                          : 'bg-amber-400'
                    }`}
                  />
                  <div>
                    <span className="text-xs font-medium uppercase tracking-wider text-white/50">
                      Sync State
                    </span>
                    <h4 className="text-sm font-semibold text-white">
                      {driftStatus.driftState === 'IN_SYNC' && 'Playlists In Sync'}
                      {driftStatus.driftState === 'LOCAL_AHEAD' && 'Local Changes (Ready to Push)'}
                      {driftStatus.driftState === 'REMOTE_AHEAD' && 'Remote Changes (Ready to Pull)'}
                      {driftStatus.driftState === 'CONFLICT_DIVERGED' && 'Conflict: Both Sides Modified'}
                      {driftStatus.driftState === 'NEEDS_RECOVERY' && 'Interrupted Sync (Recovery Mode)'}
                    </h4>
                  </div>
                </div>
                <div className="text-right text-xs text-white/50">
                  <p>Nora: {driftStatus.localEntriesCount} tracks</p>
                  <p>Spotify: {driftStatus.remoteItemsCount} tracks</p>
                </div>
              </div>

              {/* Strategy Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-white/60">
                  Reconciliation Strategy
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => handleStrategyChange('UNION_MERGE')}
                    className={`flex flex-col items-start rounded-lg border p-3 text-left transition-all ${
                      strategy === 'UNION_MERGE'
                        ? 'border-[#1DB954] bg-[#1DB954]/10 text-white'
                        : 'border-white/10 bg-[#1c1e2e] text-white/70 hover:border-white/20'
                    }`}
                  >
                    <span className="text-sm font-semibold flex items-center">
                      <span className="material-symbols-rounded text-sm mr-1.5 text-[#1DB954]">
                        call_merge
                      </span>
                      Union Merge
                    </span>
                    <span className="text-xs text-white/50 mt-1">
                      Combines tracks from both sides with deterministic ordering.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStrategyChange('LOCAL_WINS')}
                    className={`flex flex-col items-start rounded-lg border p-3 text-left transition-all ${
                      strategy === 'LOCAL_WINS'
                        ? 'border-[#1DB954] bg-[#1DB954]/10 text-white'
                        : 'border-white/10 bg-[#1c1e2e] text-white/70 hover:border-white/20'
                    }`}
                  >
                    <span className="text-sm font-semibold flex items-center">
                      <span className="material-symbols-rounded text-sm mr-1.5 text-blue-400">
                        arrow_forward
                      </span>
                      Local Wins
                    </span>
                    <span className="text-xs text-white/50 mt-1">
                      Overwrites remote Spotify playlist to match Nora state.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStrategyChange('REMOTE_WINS')}
                    className={`flex flex-col items-start rounded-lg border p-3 text-left transition-all ${
                      strategy === 'REMOTE_WINS'
                        ? 'border-[#1DB954] bg-[#1DB954]/10 text-white'
                        : 'border-white/10 bg-[#1c1e2e] text-white/70 hover:border-white/20'
                    }`}
                  >
                    <span className="text-sm font-semibold flex items-center">
                      <span className="material-symbols-rounded text-sm mr-1.5 text-purple-400">
                        arrow_back
                      </span>
                      Remote Wins
                    </span>
                    <span className="text-xs text-white/50 mt-1">
                      Updates Nora playlist to match remote Spotify tracks.
                    </span>
                  </button>
                </div>
              </div>

              {/* Statistics Grid */}
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-lg border border-white/5 bg-[#1c1e2e] p-3 text-center">
                  <span className="text-xs text-white/50">Matched & In Sync</span>
                  <p className="text-lg font-bold text-green-400">
                    {plan.statistics.inSyncOccurrences}
                  </p>
                </div>
                <div className="rounded-lg border border-white/5 bg-[#1c1e2e] p-3 text-center">
                  <span className="text-xs text-white/50">Local Add / Remove</span>
                  <p className="text-lg font-bold text-blue-400">
                    +{plan.statistics.localAdditionsCount} / -{plan.statistics.localRemovalsCount}
                  </p>
                </div>
                <div className="rounded-lg border border-white/5 bg-[#1c1e2e] p-3 text-center">
                  <span className="text-xs text-white/50">Remote Add / Remove</span>
                  <p className="text-lg font-bold text-purple-400">
                    +{plan.statistics.remoteAdditionsCount} / -{plan.statistics.remoteRemovalsCount}
                  </p>
                </div>
                <div className="rounded-lg border border-white/5 bg-[#1c1e2e] p-3 text-center">
                  <span className="text-xs text-white/50">Unresolved Remote</span>
                  <p className="text-lg font-bold text-amber-400">
                    {plan.statistics.unresolvedRemoteCount}
                  </p>
                </div>
              </div>

              {/* Unresolved Warning */}
              {plan.statistics.unresolvedRemoteCount > 0 && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-center space-x-2">
                  <span className="material-symbols-rounded text-base text-amber-400">info</span>
                  <span>
                    {plan.statistics.unresolvedRemoteCount} remote track(s) cannot be resolved to audio files in your local library and will be skipped in local insertions.
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-white/10 px-6 py-4 bg-[#1a1b2a]">
          <Button
            label={syncResult ? 'Done' : 'Cancel'}
            className="hover:bg-white/10"
            clickHandler={onClose}
            isDisabled={isSyncing}
          />

          {!syncResult && plan && (
            <Button
              label={isSyncing ? 'Synchronizing...' : 'Synchronize Now'}
              className="bg-[#1DB954] text-white hover:bg-[#1ed760]"
              clickHandler={handleExecuteSync}
              isDisabled={isSyncing || isLoading}
            />
          )}
        </div>
      </div>
    </div>
  );
};
export default SpotifyPlaylistSyncModal;
