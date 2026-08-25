import { queryClient } from '@renderer/queryClient';
import { settingsQuery } from '@renderer/queries/settings';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import Dropdown, { type DropdownOption } from '../../Dropdown';
import Button from '../../Button';
import Checkbox from '../../Checkbox';

const duplicatePolicyOptions: DropdownOption<DuplicatePolicy>[] = [
  { label: 'Skip duplicates', value: 'SKIP' },
  { label: 'Overwrite existing file', value: 'OVERWRITE' },
  { label: 'Keep both files', value: 'KEEP_BOTH' }
];

const DownloadsSettings = () => {
  const { t } = useTranslation();
  const { data: userSettings } = useQuery(settingsQuery.all);

  const { mutate: setDownloadsFolder } = useMutation({
    mutationFn: (folderPath: string | null) =>
      window.api.settings.updateOnlineDownloadsFolder(folderPath),
    onSuccess: () => void window.api.downloads.ensureFolderRegistered(),
    onSettled: () => queryClient.invalidateQueries(settingsQuery.all)
  });

  const { mutate: setDuplicatePolicy } = useMutation({
    mutationFn: (policy: DuplicatePolicy) =>
      window.api.settings.updateDownloadsDuplicatePolicy(policy),
    onSettled: () => queryClient.invalidateQueries(settingsQuery.all)
  });

  const { mutate: setAddToLibrary } = useMutation({
    mutationFn: (enabled: boolean) => window.api.settings.updateAddDownloadsToLibrary(enabled),
    onSuccess: () => void window.api.downloads.ensureFolderRegistered(),
    onSettled: () => queryClient.invalidateQueries(settingsQuery.all)
  });

  return (
    <li className="downloads settings-container">
      <div className="title-container flex items-center justify-between">
        <h3>{t('settingsPage.downloads.title', 'Online downloads')}</h3>
      </div>
      <ul className="secondary-container p-4">
        <li className="download-folder mb-4">
          <div className="description">
            {t(
              'settingsPage.downloads.folderDescription',
              'Folder where downloaded songs are saved. Downloaded files are staged in a temporary location first and only moved here once fully downloaded and tagged.'
            )}
          </div>
          <div className="mt-4 ml-2 text-sm break-all">
            {userSettings?.onlineDownloadsFolder && (
              <>
                <span>{t('settingsPage.selectedCustomLocation')}: </span>
                <span className="text-font-color-highlight dark:text-dark-font-color-highlight mr-4">
                  {userSettings.onlineDownloadsFolder}
                </span>
              </>
            )}
          </div>
          <div className="mt-4 flex flex-row items-center gap-4">
            <Button
              label={t('settingsPage.downloads.setFolder', 'Set download folder')}
              iconName="location_on"
              iconClassName="material-icons-round-outlined"
              clickHandler={() =>
                window.api.settingsHelpers
                  .getFolderLocation()
                  .then((folderPath) => {
                    if (folderPath) setDownloadsFolder(folderPath);
                  })
                  .catch((err) => console.warn(err))
              }
            />
            {userSettings?.onlineDownloadsFolder && (
              <Button
                label={t('settingsPage.downloads.clearFolder', 'Clear')}
                iconName="close"
                iconClassName="material-icons-round-outlined"
                clickHandler={() => setDownloadsFolder(null)}
              />
            )}
          </div>
        </li>

        <li className="add-downloads-to-library mb-4">
          <Checkbox
            id="addDownloadsToLibrary"
            isChecked={userSettings !== undefined && userSettings.addDownloadsToLibrary === true}
            checkedStateUpdateFunction={(state) => setAddToLibrary(state)}
            labelContent={t(
              'settingsPage.downloads.addToLibrary',
              'Add download folder to the library'
            )}
          />
          <div className="text-xs text-text-color-dimmed dark:text-dark-text-color-dimmed pl-7">
            {t(
              'settingsPage.downloads.addToLibraryDescription',
              'Downloaded songs appear in your library automatically once this folder is linked.'
            )}
          </div>
        </li>

        <li className="duplicate-policy mb-4">
          <div className="description">
            {t(
              'settingsPage.downloads.duplicatePolicyDescription',
              "What to do when a song with the same source id already exists in the download folder. Duplicates are detected by the video id embedded in the filename, not by title."
            )}
          </div>
          <div className="mt-4 flex flex-row items-center">
            <Dropdown
              name="downloadsDuplicatePolicy"
              value={userSettings?.downloadsDuplicatePolicy ?? 'SKIP'}
              options={duplicatePolicyOptions}
              onChange={(e) => setDuplicatePolicy(e.currentTarget.value as DuplicatePolicy)}
            />
          </div>
        </li>
      </ul>
    </li>
  );
};

export default DownloadsSettings;
