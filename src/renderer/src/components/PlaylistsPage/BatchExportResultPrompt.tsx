import { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import type { BatchExportResult } from '@common/collections/types';
import Button from '../Button';

interface BatchExportResultPromptProps {
  result: BatchExportResult;
}

const BatchExportResultPrompt = (props: BatchExportResultPromptProps) => {
  const { result } = props;
  const { t } = useTranslation();
  const { changePromptMenuData } = useContext(AppUpdateContext);

  const successfulItems = result.items.filter((i) => i.success);
  const failedItems = result.items.filter((i) => !i.success);

  const handleOpenFolder = () => {
    if (result.destinationDir) {
      window.api.utils.openPath(result.destinationDir);
    }
  };

  return (
    <>
      <div className="title-container text-font-color-highlight dark:text-dark-font-color-highlight mt-1 mb-4 flex items-center pr-4 text-3xl font-medium">
        {t('playlist.exportFinishedTitle', 'Export Finished')}
      </div>

      <div className="summary-banner mb-6 text-sm">
        <span className="font-semibold text-font-color-highlight dark:text-dark-font-color-highlight">
          {successfulItems.length} of {result.totalCount} playlists exported successfully.
        </span>
      </div>

      <div className="results-list max-h-60 overflow-y-auto mb-6 bg-background-color-dim/40 dark:bg-dark-background-color-dim/40 p-4 rounded-md flex flex-col gap-2">
        {successfulItems.map((item) => (
          <div key={item.playlistId} className="flex items-center text-sm gap-2">
            <span className="text-font-color-highlight dark:text-dark-font-color-highlight font-bold">✓</span>
            <span className="font-medium truncate flex-1">{item.playlistName}</span>
          </div>
        ))}

        {failedItems.map((item) => (
          <div key={item.playlistId} className="flex flex-col text-sm text-font-color-error dark:text-dark-font-color-error">
            <div className="flex items-center gap-2">
              <span className="font-bold">✗</span>
              <span className="font-medium truncate flex-1">{item.playlistName}</span>
            </div>
            {item.error && <div className="text-xs ml-5 opacity-80">{item.error}</div>}
          </div>
        ))}
      </div>

      <div className="buttons-container flex items-center justify-end gap-3">
        {result.destinationDir && (
          <Button
            label={t('playlist.openExportFolder', 'Open Export Folder')}
            iconName="folder_open"
            clickHandler={handleOpenFolder}
          />
        )}
        <Button
          label={t('common.close', 'Close')}
          className="bg-font-color-highlight! text-font-color-white! dark:bg-dark-font-color-highlight!"
          clickHandler={() => changePromptMenuData(false)}
        />
      </div>
    </>
  );
};

export default BatchExportResultPrompt;
