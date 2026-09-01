import { useTranslation } from 'react-i18next';

import type { EditableSongTags } from '../types';

type Props = {
  comment?: string;
  updateSongInfo: (_callback: (_prevSongInfo: EditableSongTags) => EditableSongTags) => void;
  onReset?: () => void;
};

const SongCommentInput = (props: Props) => {
  const { comment, updateSongInfo, onReset } = props;
  const { t } = useTranslation();

  return (
    <div className="tag-input col-span-2 flex max-w-2xl min-w-[10rem] flex-col">
      <div className="mr-[5%] mb-2 flex items-center justify-between">
        <label htmlFor="song-comment-override-tag">{t('songTagsEditingPage.comment')}</label>
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
      <textarea
        id="song-comment-override-tag"
        rows={3}
        className="border-background-color-2 bg-background-color-2 text-font-color-black focus:border-font-color-highlight dark:border-dark-background-color-2 dark:bg-dark-background-color-2 dark:text-font-color-white dark:focus:border-dark-font-color-highlight mt-1 mr-2 w-[95%] resize-none rounded-2xl border-[.15rem] p-4 transition-colors"
        name="song-comment"
        placeholder={t('songTagsEditingPage.commentPlaceholder')}
        value={comment ?? ''}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          const commentVal = e.currentTarget.value;
          updateSongInfo((prevData) => ({ ...prevData, comment: commentVal }));
        }}
      />
    </div>
  );
};

export default SongCommentInput;
