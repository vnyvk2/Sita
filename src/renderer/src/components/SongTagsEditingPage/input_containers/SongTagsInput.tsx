import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { EditableSongTags } from '../types';

type Props = {
  tags?: string[];
  updateSongInfo: (_callback: (_prevSongInfo: EditableSongTags) => EditableSongTags) => void;
  onReset?: () => void;
};

const SongTagsInput = (props: Props) => {
  const { tags = [], updateSongInfo, onReset } = props;
  const { t } = useTranslation();
  const [newTagInput, setNewTagInput] = useState('');

  const handleAddTag = () => {
    const trimmed = newTagInput.trim();
    if (trimmed && !tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      const updatedTags = [...tags, trimmed];
      updateSongInfo((prevData) => ({ ...prevData, tags: updatedTags }));
      setNewTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const updatedTags = tags.filter((tag) => tag !== tagToRemove);
    updateSongInfo((prevData) => ({ ...prevData, tags: updatedTags }));
  };

  return (
    <div className="tag-input col-span-2 flex max-w-2xl min-w-[10rem] flex-col">
      <div className="mr-[5%] mb-2 flex items-center justify-between">
        <label>{t('songTagsEditingPage.tags')}</label>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="text-font-color-highlight dark:text-dark-font-color-highlight text-xs opacity-80 hover:underline"
          >
            {t('resetTagsToDefaultPrompt.resetToDefault')}
          </button>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="bg-font-color-highlight/15 text-font-color-highlight dark:bg-dark-font-color-highlight/15 dark:text-dark-font-color-highlight border-font-color-highlight/30 dark:border-dark-font-color-highlight/30 inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium"
          >
            {tag}
            <button
              type="button"
              onClick={() => handleRemoveTag(tag)}
              className="ml-2 opacity-70 transition-opacity hover:opacity-100"
            >
              <span className="material-icons-round text-base">close</span>
            </button>
          </span>
        ))}
      </div>

      <div className="flex w-[95%] items-center space-x-3">
        <input
          type="text"
          className="border-background-color-2 bg-background-color-2 text-font-color-black focus:border-font-color-highlight dark:border-dark-background-color-2 dark:bg-dark-background-color-2 dark:text-font-color-white dark:focus:border-dark-font-color-highlight flex-1 rounded-3xl border-[.15rem] px-4 py-2.5 transition-colors"
          placeholder={t('songTagsEditingPage.addTagPlaceholder')}
          value={newTagInput}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddTag();
            }
          }}
          onChange={(e) => setNewTagInput(e.currentTarget.value)}
        />
        <button
          type="button"
          onClick={handleAddTag}
          aria-label={t('songTagsEditingPage.addTagAriaLabel')}
          className="bg-font-color-highlight dark:bg-dark-font-color-highlight flex items-center space-x-1 rounded-3xl px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <span className="material-icons-round text-base" aria-hidden="true">
            add
          </span>
          <span>{t('songTagsEditingPage.addTag')}</span>
        </button>
      </div>
    </div>
  );
};

export default SongTagsInput;
