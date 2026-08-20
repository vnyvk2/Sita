import { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import type { PlaylistExportFormat } from '@common/collections/types';
import Button from '../Button';
import Dropdown from '../Dropdown';
import { SpotifyPlaylistExportModal } from './SpotifyPlaylistExportModal';

interface PlaylistExportSettingsPromptProps {
  playlistId: number;
  playlistName?: string;
}

const PlaylistExportSettingsPrompt = (props: PlaylistExportSettingsPromptProps) => {
  const { playlistId, playlistName = 'Playlist' } = props;
  const { t } = useTranslation();
  const { changePromptMenuData } = useContext(AppUpdateContext);

  const [format, setFormat] = useState<PlaylistExportFormat | 'spotify'>('m3u8');
  const [order, setOrder] = useState<'customOrder' | 'originalOrder'>('customOrder');
  const [pathType, setPathType] = useState<'absolute' | 'relative'>('absolute');
  const [isSpotifyModalOpen, setIsSpotifyModalOpen] = useState(false);

  const handleExport = () => {
    if (format === 'spotify') {
      setIsSpotifyModalOpen(true);
      return;
    }

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
            Destination / Format
          </label>
          <Dropdown
            options={[
              { label: 'M3U8 File', value: 'm3u8' },
              { label: 'M3U File', value: 'm3u' },
              { label: 'Spotify Cloud Export', value: 'spotify' }
            ]}
            name="export-format"
            value={format}
            onChange={(e) => setFormat(e.currentTarget.value as PlaylistExportFormat | 'spotify')}
          />
        </div>

        {format !== 'spotify' && (
          <>
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
          </>
        )}

        {format === 'spotify' && (
          <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs">
            Export directly to your connected Spotify account. Nora will search Spotify&apos;s catalog, match your tracks, and create a remote playlist.
          </div>
        )}
      </div>
      <div className="buttons-container flex items-center justify-end">
        <Button
          label={t('common.cancel', 'Cancel')}
          className="mr-4"
          clickHandler={() => changePromptMenuData(false)}
        />
        <Button
          label={
            format === 'spotify'
              ? 'Continue to Spotify...'
              : t('playlist.exportPlaylist', 'Export Playlist')
          }
          className="bg-font-color-highlight! text-font-color-white! dark:bg-dark-font-color-highlight! hover:border-font-color-highlight dark:hover:border-dark-font-color-highlight px-4"
          clickHandler={handleExport}
        />
      </div>

      <SpotifyPlaylistExportModal
        playlistId={playlistId}
        playlistName={playlistName}
        isOpen={isSpotifyModalOpen}
        onClose={() => {
          setIsSpotifyModalOpen(false);
          changePromptMenuData(false);
        }}
      />
    </>
  );
};

export default PlaylistExportSettingsPrompt;
