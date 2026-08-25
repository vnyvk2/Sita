import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import MainContainer from '@renderer/components/MainContainer';
import TitleContainer from '@renderer/components/TitleContainer';
import Button from '@renderer/components/Button';
import { downloadsQuery } from '@renderer/queries/downloads';
import { settingsQuery } from '@renderer/queries/settings';

export const Route = createFileRoute('/main-player/online/')({
  component: OnlinePage
});

type PageMode = 'SEARCH' | 'PLAYLIST';

const formatDuration = (secs: number): string => {
  if (!secs) return '--:--';
  const mins = Math.floor(secs / 60);
  const remaining = Math.round(secs % 60);
  return `${mins}:${remaining.toString().padStart(2, '0')}`;
};

function statusLabelKey(status: DownloadJobState['status']): string {
  switch (status) {
    case 'QUEUED':
      return 'onlinePage.queued';
    case 'DOWNLOADING':
      return 'onlinePage.downloading';
    case 'FINALIZING':
      return 'onlinePage.finalizing';
    case 'COMPLETED':
      return 'onlinePage.completed';
    case 'SKIPPED_DUPLICATE':
      return 'onlinePage.skippedDuplicate';
    case 'CANCELLED':
      return 'onlinePage.cancelled';
    default:
      return 'onlinePage.failed';
  }
}

function useDownloadStates() {
  const queryClient = useQueryClient();
  const { data: snapshot } = useQuery(downloadsQuery.state());

  useEffect(() => {
    const unsubscribe = window.api.downloads.onUpdated((updatedSnapshot) => {
      queryClient.setQueryData(downloadsQuery.state().queryKey, updatedSnapshot);
    });
    return unsubscribe;
  }, [queryClient]);

  return snapshot ?? { jobs: [], activeCount: 0, queuedCount: 0 };
}

function DownloadsPanel({ snapshot }: { snapshot: DownloadsSnapshot }) {
  const { t } = useTranslation();

  const activeJobs = useMemo(() => {
    const relevant = snapshot.jobs.filter(
      (job) =>
        job.status === 'QUEUED' ||
        job.status === 'DOWNLOADING' ||
        job.status === 'FINALIZING' ||
        job.status === 'FAILED'
    );
    return relevant.slice(-10).reverse();
  }, [snapshot.jobs]);

  if (activeJobs.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-background-color-2/70 bg-background-color-1/80 p-4 dark:border-dark-background-color-2/70 dark:bg-dark-background-color-1/80">
      <h4 className="mb-3 text-sm font-semibold">
        {t('onlinePage.activeDownloads', 'Active downloads')}
      </h4>
      <ul className="flex flex-col gap-2">
        {activeJobs.map((job) => (
          <li key={job.jobId} className="flex items-center gap-3 text-xs">
            <span className="material-icons-round text-base">
              {job.status === 'FAILED' ? 'error' : 'downloading'}
            </span>
            <span className="min-w-0 flex-1 truncate" title={job.title}>
              {job.title}
            </span>
            <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed">
              {job.status === 'DOWNLOADING'
                ? t('onlinePage.downloading', { progress: `${job.progress}%` })
                : t(statusLabelKey(job.status), {
                    progress: `${job.progress}%`,
                    defaultValue: job.status
                  })}
            </span>
            {(job.status === 'QUEUED' || job.status === 'DOWNLOADING') && (
              <button
                type="button"
                className="material-icons-round-outlined cursor-pointer text-sm"
                title={t('onlinePage.cancelDownload', 'Cancel')}
                onClick={() => void window.api.downloads.cancel(job.jobId)}
              >
                close
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface TrackRowProps {
  track: OnlineTrackResult;
  playlist?: { id: string; name: string };
  /** Latest job state for this track's videoId, from the single page-level subscription. */
  jobState?: DownloadJobState;
}

function TrackRow({ track, playlist, jobState }: TrackRowProps) {
  const [error, setError] = useState<string | null>(null);

  const thumbnail = track.thumbnails.at(-1);

  const download = async () => {
    setError(null);
    try {
      if (playlist) {
        await window.api.downloads.enqueueMany([toEnqueueInput(track)], playlist.id, playlist.name);
      } else {
        await window.api.downloads.enqueue(toEnqueueInput(track));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-background-color-2/60 dark:hover:bg-dark-background-color-2/60">
      {thumbnail ? (
        <img src={thumbnail} alt="" className="h-11 w-20 rounded object-cover" loading="lazy" />
      ) : (
        <span className="material-icons-round h-11 w-20 rounded bg-background-color-2 p-4 dark:bg-dark-background-color-2">
          music_note
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm" title={track.title}>
          {track.title}
        </p>
        <p className="truncate text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed">
          {track.channel} &bull; {formatDuration(track.duration)}
        </p>
        {error && <p className="truncate text-xs text-rose-500">{error}</p>}
      </div>
      <div className="w-36 shrink-0 text-right text-xs">
        <JobStatusChip job={jobState} onDownload={download} />
      </div>
    </li>
  );
}

function toEnqueueInput(track: OnlineTrackResult): EnqueueDownloadInput {
  return {
    videoId: track.videoId,
    title: track.title,
    artist: track.channel.replace(/\s*-\s*Topic$/i, '').trim() || undefined,
    thumbnailUrl: track.thumbnails.at(-1),
    durationSecs: track.duration
  };
}

function JobStatusChip({ job, onDownload }: { job?: DownloadJobState; onDownload: () => void }) {
  const { t } = useTranslation();

  if (!job || job.status === 'CANCELLED' || job.status === 'FAILED') {
    return (
      <Button
        label={t('onlinePage.download', 'Download')}
        iconName="download"
        iconClassName="material-icons-round-outlined"
        clickHandler={() => void onDownload()}
      />
    );
  }

  if (job.status === 'DOWNLOADING') {
    return (
      <span className="text-font-color-highlight dark:text-dark-font-color-highlight">
        {t('onlinePage.downloading', { progress: `${job.progress}%` })}
      </span>
    );
  }

  return (
    <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed">
      {t(statusLabelKey(job.status), { defaultValue: job.status })}
    </span>
  );
}

function OnlinePage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<PageMode>('SEARCH');
  const [searchText, setSearchText] = useState('');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Single IPC subscription for the whole page; rows read from this snapshot.
  const downloadStates = useDownloadStates();
  const jobsByVideoId = useMemo(
    () => new Map(downloadStates.jobs.map((job) => [job.videoId, job])),
    [downloadStates.jobs]
  );

  const { data: userSettings } = useQuery(settingsQuery.all);
  const hasFolder = Boolean(userSettings?.onlineDownloadsFolder);

  const searchMutation = useMutation({
    mutationFn: (query: string) => window.api.downloads.search(query),
    mutationKey: downloadsQuery.state().queryKey
  });

  const playlistMutation = useMutation({
    mutationFn: (url: string) => window.api.downloads.resolvePlaylist(url)
  });

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (searchText.trim()) searchMutation.mutate(searchText.trim());
  };

  const loadPlaylist = (event: React.FormEvent) => {
    event.preventDefault();
    if (playlistUrl.trim()) playlistMutation.mutate(playlistUrl.trim());
  };

  const downloadEntirePlaylist = async () => {
    const info = playlistMutation.data;
    if (!info) return;
    await window.api.downloads.enqueueMany(
      info.entries.map(toEnqueueInput),
      info.playlistId,
      info.title
    );
  };

  const results = searchMutation.data ?? [];
  const playlist = playlistMutation.data;

  return (
    <MainContainer className="online-container relative flex h-full flex-col overflow-y-auto px-8 pb-12 pt-6">
      <div className="mb-6">
        <TitleContainer
          title={t('onlinePage.title', 'Online')}
          className="text-2xl font-bold tracking-tight text-font-color-black dark:text-font-color-white"
        />
        <p className="mt-1 text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed">
          {t('onlinePage.subtitle')}
        </p>
      </div>

      {!hasFolder && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-orange-400/50 bg-orange-400/10 p-3 text-xs">
          <span className="material-icons-round">warning</span>
          {t('onlinePage.configureFolderWarning')}
        </div>
      )}

      <DownloadsPanel snapshot={downloadStates} />

      {/* Mode tabs */}
      <div className="mb-4 flex w-max items-center rounded-xl border border-background-color-2/70 bg-background-color-1/90 p-1 dark:border-dark-background-color-2/70 dark:bg-dark-background-color-1/90">
        {(['SEARCH', 'PLAYLIST'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setMode(tab)}
            className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-all ${
              mode === tab
                ? 'bg-font-color-highlight text-white shadow-sm dark:bg-dark-font-color-highlight dark:text-dark-background-color-1'
                : 'text-font-color-dimmed hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:text-font-color-white'
            }`}
          >
            {tab === 'SEARCH'
              ? t('onlinePage.searchTab')
              : t('onlinePage.playlistTab')}
          </button>
        ))}
      </div>

      {mode === 'SEARCH' ? (
        <>
          <form onSubmit={submitSearch} className="mb-4 flex gap-3">
            <input
              ref={searchInputRef}
              value={searchText}
              onChange={(e) => setSearchText(e.currentTarget.value)}
              placeholder={t('onlinePage.searchPlaceholder')}
              className="flex-1 rounded-lg border border-background-color-2 bg-background-color-1 px-4 py-2 text-sm outline-none focus:border-font-color-highlight dark:border-dark-background-color-2 dark:bg-dark-background-color-1"
            />
            <Button
              label={searchMutation.isPending ? t('onlinePage.searching') : t('onlinePage.search')}
              iconName="search"
              iconClassName="material-icons-round-outlined"
              clickHandler={() => undefined}
              className="pointer-events-none opacity-90"
            />
          </form>

          <ul className="flex flex-col gap-1">
            {results.map((track) => (
              <TrackRow
                key={track.videoId}
                track={track}
                jobState={jobsByVideoId.get(track.videoId)}
              />
            ))}
          </ul>
          {searchMutation.isSuccess && results.length === 0 && (
            <p className="mt-8 text-center text-sm text-font-color-dimmed dark:text-dark-font-color-dimmed">
              {t('onlinePage.noResults')}
            </p>
          )}
        </>
      ) : (
        <>
          <form onSubmit={loadPlaylist} className="mb-4 flex gap-3">
            <input
              value={playlistUrl}
              onChange={(e) => setPlaylistUrl(e.currentTarget.value)}
              placeholder={t('onlinePage.playlistPlaceholder')}
              className="flex-1 rounded-lg border border-background-color-2 bg-background-color-1 px-4 py-2 text-sm outline-none focus:border-font-color-highlight dark:border-dark-background-color-2 dark:bg-dark-background-color-1"
            />
            <Button
              label={playlistMutation.isPending ? t('onlinePage.loadingPlaylist') : t('onlinePage.loadPlaylist')}
              iconName="link"
              iconClassName="material-icons-round-outlined"
              clickHandler={() => undefined}
              className="pointer-events-none opacity-90"
            />
          </form>

          {playlist && (
            <div className="rounded-xl border border-background-color-2/70 bg-background-color-1/60 p-4 dark:border-dark-background-color-2/70 dark:bg-dark-background-color-1/60">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{playlist.title}</p>
                  <p className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed">
                    {t('onlinePage.songsCount', { count: playlist.entries.length })}
                    {playlist.excludedCount > 0 &&
                      ` • ${t('onlinePage.excludedCount', { count: playlist.excludedCount })}`}
                  </p>
                </div>
                <Button
                  label={t('onlinePage.downloadAll')}
                  iconName="download"
                  iconClassName="material-icons-round-outlined"
                  clickHandler={() => void downloadEntirePlaylist()}
                />
              </div>
              <ul className="flex max-h-[28rem] flex-col gap-1 overflow-y-auto">
                {playlist.entries.map((track) => (
                  <TrackRow
                    key={track.videoId}
                    track={track}
                    playlist={{ id: playlist.playlistId, name: playlist.title }}
                    jobState={jobsByVideoId.get(track.videoId)}
                  />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </MainContainer>
  );
}

export default OnlinePage;
