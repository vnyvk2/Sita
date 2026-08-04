import { useTranslation } from 'react-i18next';

type Props = {
  comment?: string;
  updateSongInfo: (_callback: (_prevSongInfo: SongTags & { comment?: string }) => SongTags & { comment?: string }) => void;
  onReset?: () => void;
};

const SongCommentInput = (props: Props) => {
  const { comment, updateSongInfo, onReset } = props;
  const { t } = useTranslation();

  return (
    <div className="tag-input flex max-w-2xl min-w-[10rem] flex-col col-span-2">
      <div className="flex items-center justify-between mr-[5%] mb-2">
        <label htmlFor="song-comment-override-tag">
          {t('songTagsEditingPage.comment', 'Comment')}
        </label>
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
      <textarea
        id="song-comment-override-tag"
        rows={3}
        className="border-background-color-2 bg-background-color-2 text-font-color-black focus:border-font-color-highlight dark:border-dark-background-color-2 dark:bg-dark-background-color-2 dark:text-font-color-white dark:focus:border-dark-font-color-highlight mt-1 mr-2 w-[95%] rounded-2xl border-[.15rem] p-4 transition-colors resize-none"
        name="song-comment"
        placeholder={t('songTagsEditingPage.commentPlaceholder', 'Add personal notes or comments...')}
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
