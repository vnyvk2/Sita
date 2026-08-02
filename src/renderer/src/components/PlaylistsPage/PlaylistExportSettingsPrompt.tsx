import { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import type { PlaylistExportFormat, PlaylistExportOptions } from '@common/collections/types';
import Button from '../Button';
import Dropdown from '../Dropdown';

interface PlaylistExportSettingsPromptProps {
  playlistId: number;
}

const PlaylistExportSettingsPrompt = (props: PlaylistExportSettingsPromptProps) => {
  const { playlistId } = props;
  const { t } = useTranslation();
  const { changePromptMenuData } = useContext(AppUpdateContext);

  const [format, setFormat] = useState<PlaylistExportFormat>('m3u8');
  const [order, setOrder] = useState<'customOrder' | 'originalOrder'>('customOrder');
  const [pathType, setPathType] = useState<'absolute' | 'relative'>('absolute');

  const handleExport = () => {
    window.api.collections.export(playlistId, {
      format,
      order,
      pathType
    });
    changePromptMenuData(false);
  };

  return (
    <>
      <div className="title-container text-font-color-highlight dark:text-dark-font-color-highlight mt-1 mb-8 flex items-center pr-4 text-3xl font-medium">
        {t('playlist.exportPlaylist', 'Export Playlist')}
      </div>
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
            name="export-format"
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
            name="export-order"
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
            name="export-path-type"
            value={pathType}
            onChange={(e) => setPathType(e.currentTarget.value as 'absolute' | 'relative')}
          />
        </div>
      </div>
      <div className="buttons-container flex items-center justify-end">
        <Button
          label={t('common.cancel', 'Cancel')}
          className="mr-4"
          clickHandler={() => changePromptMenuData(false)}
        />
        <Button
          label={t('playlist.exportPlaylist', 'Export Playlist')}
          className="bg-font-color-highlight! text-font-color-white! dark:bg-dark-font-color-highlight! hover:border-font-color-highlight dark:hover:border-dark-font-color-highlight w-32"
          clickHandler={handleExport}
        />
      </div>
    </>
  );
};

export default PlaylistExportSettingsPrompt;
