import { useTranslation } from 'react-i18next';

type Props = {
  rating?: number;
  updateSongInfo: (_callback: (_prevSongInfo: SongTags & { rating?: number }) => SongTags & { rating?: number }) => void;
  onReset?: () => void;
};

const SongRatingInput = (props: Props) => {
  const { rating = 0, updateSongInfo, onReset } = props;
  const { t } = useTranslation();

  const handleStarClick = (starValue: number) => {
    // Toggle off if clicking current rating
    const nextRating = rating === starValue ? 0 : starValue;
    updateSongInfo((prevData) => ({ ...prevData, rating: nextRating }));
  };

  return (
    <div className="tag-input flex max-w-2xl min-w-[10rem] flex-col">
      <div className="flex items-center justify-between mr-[10%] mb-2">
        <label>{t('songTagsEditingPage.rating', 'Rating')}</label>
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
      <div className="flex items-center space-x-2 py-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => handleStarClick(star)}
            className="transition-transform hover:scale-110 focus:outline-none"
            title={`${star} Star${star > 1 ? 's' : ''}`}
          >
            <span className="material-icons-round text-3xl text-amber-400">
              {star <= rating ? 'star' : 'star_border'}
            </span>
          </button>
        ))}
        <span className="ml-3 text-sm opacity-70">
          {rating > 0 ? `${rating} / 5` : t('common.unrated', 'Unrated')}
        </span>
      </div>
    </div>
  );
};

export default SongRatingInput;
