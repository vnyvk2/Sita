import { useTranslation } from 'react-i18next';

import type { EditableSongTags } from '../types';

type Props = {
  discNumber?: number;
  updateSongInfo: (_callback: (_prevSongInfo: EditableSongTags) => EditableSongTags) => void;
  onReset?: () => void;
};

const SongDiscNumberInput = (props: Props) => {
  const { discNumber, updateSongInfo, onReset } = props;
  const { t } = useTranslation();

  return (
    <div className="tag-input flex max-w-2xl min-w-[10rem] flex-col">
      <div className="flex items-center justify-between mr-[10%]">
        <label htmlFor="song-disc-number-override-tag">
          {t('songTagsEditingPage.discNumber')}
        </label>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-font-color-highlight dark:text-dark-font-color-highlight hover:underline opacity-80"
          >
            {t('resetTagsToDefaultPrompt.resetToDefault')}
          </button>
        )}
      </div>
      <input
        type="number"
        id="song-disc-number-override-tag"
        min={1}
        className="border-background-color-2 bg-background-color-2 text-font-color-black focus:border-font-color-highlight dark:border-dark-background-color-2 dark:bg-dark-background-color-2 dark:text-font-color-white dark:focus:border-dark-font-color-highlight mt-2 mr-2 w-[90%] rounded-3xl border-[.15rem] px-4 py-3 transition-colors"
        name="song-disc-number"
        placeholder={t('songTagsEditingPage.discNumberPlaceholder')}
        value={discNumber ?? ''}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          const val = parseInt(e.currentTarget.value, 10);
          const parsedDiscNumber = Number.isNaN(val) ? undefined : val;
          updateSongInfo((prevData) => ({ ...prevData, discNumber: parsedDiscNumber }));
        }}
      />
    </div>
  );
};

export default SongDiscNumberInput;
