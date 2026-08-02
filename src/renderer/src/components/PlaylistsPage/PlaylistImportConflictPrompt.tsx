import { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import Button from '../Button';
import { CollectionClient } from '@renderer/api/CollectionClient';

interface PlaylistImportConflictPromptProps {
  filePath?: string;
  targetPlaylistId?: number;
  playlistName?: string;
  importedPlaylistName?: string;
  totalEntries?: number;
  skippedCount?: number;
  repairedCount?: number;
}

const PlaylistImportConflictPrompt = (props: PlaylistImportConflictPromptProps) => {
  const {
    filePath,
    targetPlaylistId,
    playlistName,
    importedPlaylistName,
    totalEntries,
    skippedCount,
    repairedCount
  } = props;
  const { t } = useTranslation();
  const { changePromptMenuData } = useContext(AppUpdateContext);
  const [confirmingReplace, setConfirmingReplace] = useState(false);

  const handleAction = (strategy: 'create' | 'merge' | 'replace') => {
    changePromptMenuData(false);
    CollectionClient.import({
      targetPlaylistId,
      filePath,
      mode: strategy
    });
  };

  return (
    <>
      <div className="title-container text-font-color-highlight dark:text-dark-font-color-highlight mt-1 mb-6 flex items-center pr-4 text-3xl font-medium">
        {t('playlist.importConflictTitle', 'Playlist Import Options')}
      </div>

      {totalEntries !== undefined && (
        <div className="summary-box bg-background-color-dim/50 dark:bg-dark-background-color-dim/50 p-4 rounded-md mb-6 text-sm">
          <div className="font-semibold mb-1 text-font-color-highlight dark:text-dark-font-color-highlight">
            {t('playlist.importSummary', 'Import Analysis')}
          </div>
          {importedPlaylistName && (
            <div className="font-medium text-xs mb-1 opacity-80">
              Playlist: {importedPlaylistName}
            </div>
          )}
          <div>Total tracks found: {totalEntries}</div>
          {repairedCount !== undefined && repairedCount > 0 && (
            <div className="text-font-color-highlight/80 dark:text-dark-font-color-highlight/80 mt-1">
              {repairedCount} tracks repaired
            </div>
          )}
          {skippedCount !== undefined && skippedCount > 0 && (
            <div className="text-font-color-error dark:text-dark-font-color-error mt-1">
              {skippedCount} tracks missing in library
            </div>
          )}
        </div>
      )}

      <div className="description mb-6 text-font-color-highlight/80 dark:text-dark-font-color-highlight/80 text-lg">
        {targetPlaylistId && playlistName
          ? t('playlist.importConflictDesc', {
              playlistName,
              defaultValue: `How would you like to handle importing into '${playlistName}'?`
            })
          : t('playlist.importCreateDesc', {
              importedPlaylistName,
              defaultValue: `Import '${importedPlaylistName || 'playlist'}' into your library?`
            })}
      </div>

      {confirmingReplace ? (
        <div className="replace-warning-box bg-font-color-error/10 border border-font-color-error/30 p-4 rounded-md mb-6">
          <div className="text-font-color-error font-semibold mb-2">
            ⚠️ Warning: Destructive Action
          </div>
          <div className="text-sm mb-4">
            Replacing will clear all existing tracks from &apos;{playlistName}&apos; and overwrite it with the imported tracks.
          </div>
          <div className="flex justify-end gap-3">
            <Button
              label={t('common.cancel', 'Cancel')}
              clickHandler={() => setConfirmingReplace(false)}
            />
            <Button
              label={t('playlist.confirmReplace', 'Confirm Replace')}
              className="danger-btn bg-font-color-error! text-white!"
              clickHandler={() => handleAction('replace')}
            />
          </div>
        </div>
      ) : (
        <div className="buttons-container flex flex-col gap-3">
          <Button
            label={t('playlist.createNewPlaylist', 'Create new playlist')}
            iconName="add"
            className="w-full justify-start py-3 text-left font-medium cursor-pointer"
            clickHandler={() => handleAction('create')}
          />
          {targetPlaylistId && (
            <>
              <Button
                label={t('playlist.mergeIntoCurrent', 'Merge into current playlist')}
                iconName="merge_type"
                className="w-full justify-start py-3 text-left font-medium cursor-pointer"
                clickHandler={() => handleAction('merge')}
              />
              <Button
                label={t('playlist.replaceCurrent', 'Replace current playlist')}
                iconName="sync"
                className="danger-btn w-full justify-start py-3 text-left font-medium cursor-pointer"
                clickHandler={() => setConfirmingReplace(true)}
              />
            </>
          )}
        </div>
      )}
    </>
  );
};

export default PlaylistImportConflictPrompt;
