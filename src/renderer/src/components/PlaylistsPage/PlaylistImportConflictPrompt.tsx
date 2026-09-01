import { CollectionClient } from '@renderer/api/CollectionClient';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Button from '../Button';

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
        <div className="summary-box bg-background-color-dim/50 dark:bg-dark-background-color-dim/50 mb-6 rounded-md p-4 text-sm">
          <div className="text-font-color-highlight dark:text-dark-font-color-highlight mb-1 font-semibold">
            {t('playlist.importSummary', 'Import Analysis')}
          </div>
          {importedPlaylistName && (
            <div className="mb-1 text-xs font-medium opacity-80">
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

      <div className="description text-font-color-highlight/80 dark:text-dark-font-color-highlight/80 mb-6 text-lg">
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
        <div className="replace-warning-box bg-font-color-error/10 border-font-color-error/30 mb-6 rounded-md border p-4">
          <div className="text-font-color-error mb-2 font-semibold">
            ⚠️ Warning: Destructive Action
          </div>
          <div className="mb-4 text-sm">
            Replacing will clear all existing tracks from &apos;{playlistName}&apos; and overwrite
            it with the imported tracks.
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
            className="w-full cursor-pointer justify-start py-3 text-left font-medium"
            clickHandler={() => handleAction('create')}
          />
          {targetPlaylistId && (
            <>
              <Button
                label={t('playlist.mergeIntoCurrent', 'Merge into current playlist')}
                iconName="merge_type"
                className="w-full cursor-pointer justify-start py-3 text-left font-medium"
                clickHandler={() => handleAction('merge')}
              />
              <Button
                label={t('playlist.replaceCurrent', 'Replace current playlist')}
                iconName="sync"
                className="danger-btn w-full cursor-pointer justify-start py-3 text-left font-medium"
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
