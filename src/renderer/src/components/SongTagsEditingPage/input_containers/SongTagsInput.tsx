import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  tags?: string[];
  updateSongInfo: (_callback: (_prevSongInfo: SongTags & { tags?: string[] }) => SongTags & { tags?: string[] }) => void;
  onReset?: () => void;
};

const SongTagsInput = (props: Props) => {
  const { tags = [], updateSongInfo, onReset } = props;
  const { t } = useTranslation();
  const [newTagInput, setNewTagInput] = useState('');

  const handleAddTag = () => {
    const trimmed = newTagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
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
    <div className="tag-input flex max-w-2xl min-w-[10rem] flex-col col-span-2">
      <div className="flex items-center justify-between mr-[5%] mb-2">
        <label>{t('songTagsEditingPage.tags', 'Tags')}</label>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-font-color-highlight dark:text-dark-font-color-highlight hover:underline opacity-80"
          >
            {t('common.reset', 'Reset')}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-font-color-highlight/15 text-font-color-highlight dark:bg-dark-font-color-highlight/15 dark:text-dark-font-color-highlight border border-font-color-highlight/30 dark:border-dark-font-color-highlight/30"
          >
            {tag}
            <button
              type="button"
              onClick={() => handleRemoveTag(tag)}
              className="ml-2 hover:opacity-100 opacity-70 transition-opacity"
            >
              <span className="material-icons-round text-base">close</span>
            </button>
          </span>
        ))}
      </div>

      <div className="flex items-center space-x-3 w-[95%]">
        <input
          type="text"
          className="border-background-color-2 bg-background-color-2 text-font-color-black focus:border-font-color-highlight dark:border-dark-background-color-2 dark:bg-dark-background-color-2 dark:text-font-color-white dark:focus:border-dark-font-color-highlight rounded-3xl border-[.15rem] px-4 py-2.5 flex-1 transition-colors"
          placeholder={t('songTagsEditingPage.addTagPlaceholder', 'Add a tag (e.g. Rock, Favorite, Chill)...')}
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
          className="px-4 py-2.5 rounded-3xl bg-font-color-highlight dark:bg-dark-font-color-highlight text-white font-medium hover:opacity-90 transition-opacity text-sm flex items-center space-x-1"
        >
          <span className="material-icons-round text-base">add</span>
          <span>{t('common.add', 'Add Tag')}</span>
        </button>
      </div>
    </div>
  );
};

export default SongTagsInput;
