import type { BatchExportResult } from '@common/collections/types';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import { useContext } from 'react';
import { useTranslation } from 'react-i18next';

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
        <span className="text-font-color-highlight dark:text-dark-font-color-highlight font-semibold">
          {successfulItems.length} of {result.totalCount} playlists exported successfully.
        </span>
      </div>

      <div className="results-list bg-background-color-dim/40 dark:bg-dark-background-color-dim/40 mb-6 flex max-h-60 flex-col gap-2 overflow-y-auto rounded-md p-4">
        {successfulItems.map((item) => (
          <div key={item.playlistId} className="flex items-center gap-2 text-sm">
            <span className="text-font-color-highlight dark:text-dark-font-color-highlight font-bold">
              ✓
            </span>
            <span className="flex-1 truncate font-medium">{item.playlistName}</span>
          </div>
        ))}

        {failedItems.map((item) => (
          <div
            key={item.playlistId}
            className="text-font-color-error dark:text-dark-font-color-error flex flex-col text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="font-bold">✗</span>
              <span className="flex-1 truncate font-medium">{item.playlistName}</span>
            </div>
            {item.error && <div className="ml-5 text-xs opacity-80">{item.error}</div>}
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
