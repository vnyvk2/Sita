import type {
  PlaylistExportFormat,
  PlaylistBatchExportOptions,
  BatchExportResult
} from '@common/collections/types';
import { CollectionClient } from '@renderer/api/CollectionClient';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import { useContext, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import Button from '../Button';
import Dropdown from '../Dropdown';
import BatchExportResultPrompt from './BatchExportResultPrompt';

interface PlaylistBatchExportSettingsPromptProps {
  playlistIds: number[];
}

const PlaylistBatchExportSettingsPrompt = (props: PlaylistBatchExportSettingsPromptProps) => {
  const { playlistIds } = props;
  const { t } = useTranslation();
  const { changePromptMenuData } = useContext(AppUpdateContext);

  const [format, setFormat] = useState<PlaylistExportFormat>('m3u8');
  const [order, setOrder] = useState<'customOrder' | 'originalOrder'>('customOrder');
  const [pathType, setPathType] = useState<'absolute' | 'relative'>('absolute');
  const [destinationDir, setDestinationDir] = useState<string>('');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    playlistName: string;
  } | null>(null);

  useEffect(() => {
    const handleProgress = (_event: any, messageCode: string, data: any) => {
      if (messageCode === 'PLAYLIST_BATCH_EXPORT_PROGRESS') {
        setProgress(data);
      }
    };

    if (window.api.messages?.getMessageFromMain) {
      window.api.messages.getMessageFromMain(handleProgress);
    }

    return () => {
      if (window.api.messages?.removeMessageToRendererEventListener) {
        window.api.messages.removeMessageToRendererEventListener(handleProgress);
      }
    };
  }, []);

  const handleBrowseDirectory = async () => {
    const dirs = await window.api.utils.showOpenDialog({
      title: 'Select Destination Folder for Batch Export',
      properties: ['openDirectory', 'createDirectory']
    });
    if (dirs && dirs.length > 0) {
      setDestinationDir(dirs[0]);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    const options: PlaylistBatchExportOptions = {
      format,
      order,
      pathType,
      destinationDir: destinationDir || undefined
    };

    try {
      const result: BatchExportResult = await CollectionClient.exportBatch(playlistIds, options);
      setIsExporting(false);

      if (result && result.items.length > 0) {
        changePromptMenuData(true, <BatchExportResultPrompt result={result} />);
      } else {
        changePromptMenuData(false);
      }
    } catch (err) {
      setIsExporting(false);
      changePromptMenuData(false);
    }
  };

  return (
    <>
      <div className="title-container text-font-color-highlight dark:text-dark-font-color-highlight mt-1 mb-6 flex items-center pr-4 text-3xl font-medium">
        {t('playlist.exportBatchTitle', {
          count: playlistIds.length,
          defaultValue: `Export ${playlistIds.length} Playlists`
        })}
      </div>

      {isExporting && progress ? (
        <div className="export-progress-box bg-background-color-dim/50 dark:bg-dark-background-color-dim/50 mb-6 rounded-md p-6">
          <div className="text-font-color-highlight dark:text-dark-font-color-highlight mb-2 text-lg font-semibold">
            {t('playlist.exportingProgress', 'Exporting playlists...')}
          </div>
          <div className="mb-3 text-sm opacity-80">
            {progress.current} / {progress.total} —{' '}
            <span className="font-medium">{progress.playlistName}</span>
          </div>
          <div className="bg-background-color-dim dark:bg-dark-background-color-dim h-2.5 w-full overflow-hidden rounded-full">
            <div
              className="bg-font-color-highlight dark:bg-dark-font-color-highlight h-2.5 transition-all duration-200"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="description mb-6">
          <div className="mb-4">
            <label className="text-font-color-highlight dark:text-dark-font-color-highlight mb-2 block font-medium">
              Format
            </label>
            <Dropdown
              options={[
                { label: 'M3U8', value: 'm3u8' },
                { label: 'M3U', value: 'm3u' }
              ]}
              name="batch-export-format"
              value={format}
              onChange={(e) => setFormat(e.currentTarget.value as PlaylistExportFormat)}
            />
          </div>

          <div className="mb-4">
            <label className="text-font-color-highlight dark:text-dark-font-color-highlight mb-2 block font-medium">
              Playlist Order
            </label>
            <Dropdown
              options={[
                { label: 'Custom Order', value: 'customOrder' },
                { label: 'Original Order', value: 'originalOrder' }
              ]}
              name="batch-export-order"
              value={order}
              onChange={(e) => setOrder(e.currentTarget.value as 'customOrder' | 'originalOrder')}
            />
          </div>

          <div className="mb-4">
            <label className="text-font-color-highlight dark:text-dark-font-color-highlight mb-2 block font-medium">
              Paths
            </label>
            <Dropdown
              options={[
                { label: 'Absolute Paths', value: 'absolute' },
                { label: 'Relative Paths', value: 'relative' }
              ]}
              name="batch-export-path-type"
              value={pathType}
              onChange={(e) => setPathType(e.currentTarget.value as 'absolute' | 'relative')}
            />
          </div>

          <div className="mb-4">
            <label className="text-font-color-highlight dark:text-dark-font-color-highlight mb-2 block font-medium">
              Destination Folder
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                placeholder={t('playlist.noFolderSelected', 'No folder selected')}
                value={destinationDir}
                className="bg-background-color-dim dark:bg-dark-background-color-dim w-full truncate rounded-md px-3 py-2 text-sm"
              />
              <Button label={t('common.browse', 'Browse')} clickHandler={handleBrowseDirectory} />
            </div>
          </div>
        </div>
      )}

      <div className="buttons-container flex items-center justify-end">
        <Button
          label={t('common.cancel', 'Cancel')}
          className="mr-4"
          isDisabled={isExporting}
          clickHandler={() => changePromptMenuData(false)}
        />
        <Button
          label={t('playlist.exportPlaylistsBtn', {
            count: playlistIds.length,
            defaultValue: `Export ${playlistIds.length} Playlists`
          })}
          className="bg-font-color-highlight! text-font-color-white! dark:bg-dark-font-color-highlight! hover:border-font-color-highlight dark:hover:border-dark-font-color-highlight px-4"
          isDisabled={isExporting}
          clickHandler={handleExport}
        />
      </div>
    </>
  );
};

export default PlaylistBatchExportSettingsPrompt;
