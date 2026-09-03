import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { memo, useCallback, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import type { PanelProps } from '../../registry';

interface MetadataRowProps {
  label: string;
  value?: string | number | null;
  canCopy?: boolean;
}

const MetadataRow: FC<MetadataRowProps> = ({ label, value, canCopy }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (value) {
      navigator.clipboard.writeText(String(value));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [value]);

  if (value === undefined || value === null || value === '') return null;

  return (
    <div className="flex items-start justify-between gap-2 border-b border-stone-200/40 py-2 text-xs dark:border-stone-800/40">
      <span className="text-font-color-dimmed shrink-0 font-medium">{label}</span>
      <div className="text-font-color-black dark:text-font-color-white flex min-w-0 items-center gap-1.5 text-right font-mono text-[11px]">
        <span className="max-w-[200px] truncate" title={String(value)}>
          {String(value)}
        </span>
        {canCopy && (
          <button
            type="button"
            onClick={handleCopy}
            title="Copy"
            className="text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white flex h-4 w-4 cursor-pointer items-center justify-center rounded"
          >
            <span className="material-symbols-rounded text-xs">
              {copied ? 'check' : 'content_copy'}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};

export const TrackInfoPanel: FC<PanelProps> = memo(() => {
  const { t } = useTranslation();
  const currentSongData = useStore(store, (state) => state.currentSongData);

  if (!currentSongData.songId) {
    return (
      <div className="track-info-panel text-font-color-dimmed bg-background-color-1 dark:bg-dark-background-color-1 flex h-full w-full flex-col items-center justify-center p-6 text-center">
        <span className="material-symbols-rounded mb-2 text-4xl opacity-50">info</span>
        <p className="text-xs">{t('player.noSongSelected', 'No track selected')}</p>
      </div>
    );
  }

  const fileExt = currentSongData.path
    ? (currentSongData.path.split('.').pop()?.toUpperCase() ?? 'UNKNOWN')
    : 'UNKNOWN';

  const artistNames = Array.isArray(currentSongData.artists)
    ? currentSongData.artists.map((a) => a.name).join(', ')
    : '';

  const formatDuration = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s} (${sec.toFixed(1)}s)`;
  };

  return (
    <div className="track-info-panel bg-background-color-1 dark:bg-dark-background-color-1 text-font-color-black dark:text-font-color-white flex h-full w-full flex-col overflow-x-hidden overflow-y-auto p-4">
      {/* File & Codec Section */}
      <div className="mb-4">
        <h3 className="text-font-color-dimmed mb-2 text-[11px] font-bold tracking-wider uppercase">
          Audio Stream & File
        </h3>
        <div className="bg-background-color-2/40 dark:bg-dark-background-color-2/40 rounded-lg px-3">
          <MetadataRow label="Format" value={fileExt} />
          <MetadataRow label="Path" value={currentSongData.path} canCopy />
          <MetadataRow label="Duration" value={formatDuration(currentSongData.duration)} />
          <MetadataRow
            label="Source"
            value={currentSongData.isKnownSource ? 'Local Library' : 'External'}
          />
        </div>
      </div>

      {/* Metadata Tags Section */}
      <div className="mb-4">
        <h3 className="text-font-color-dimmed mb-2 text-[11px] font-bold tracking-wider uppercase">
          Tags & Release
        </h3>
        <div className="bg-background-color-2/40 dark:bg-dark-background-color-2/40 rounded-lg px-3">
          <MetadataRow label="Title" value={currentSongData.title} />
          <MetadataRow label="Artists" value={artistNames} />
          <MetadataRow label="Album" value={currentSongData.album?.name} />
          <MetadataRow label="Track ID" value={currentSongData.songId} />
        </div>
      </div>

      {/* ReplayGain Section */}
      {currentSongData.replayGain && (
        <div className="mb-2">
          <h3 className="text-font-color-dimmed mb-2 text-[11px] font-bold tracking-wider uppercase">
            ReplayGain
          </h3>
          <div className="bg-background-color-2/40 dark:bg-dark-background-color-2/40 rounded-lg px-3">
            <MetadataRow
              label="Track Gain"
              value={
                currentSongData.replayGain.trackGain != null
                  ? `${currentSongData.replayGain.trackGain} dB`
                  : null
              }
            />
            <MetadataRow label="Track Peak" value={currentSongData.replayGain.trackPeak} />
            <MetadataRow
              label="Album Gain"
              value={
                currentSongData.replayGain.albumGain != null
                  ? `${currentSongData.replayGain.albumGain} dB`
                  : null
              }
            />
            <MetadataRow label="Album Peak" value={currentSongData.replayGain.albumPeak} />
          </div>
        </div>
      )}
    </div>
  );
});

TrackInfoPanel.displayName = 'TrackInfoPanel';
export default TrackInfoPanel;
