import { useTranslation } from 'react-i18next';

import type { EditableSongTags } from '../types';


type Props = {
  rating?: number;
  updateSongInfo: (_callback: (_prevSongInfo: EditableSongTags) => EditableSongTags) => void;
  onReset?: () => void;
};

const SongRatingInput = (props: Props) => {
  const { rating, updateSongInfo, onReset } = props;
  const { t } = useTranslation();

  const handleStarClick = (starValue: number) => {
    // Toggle off (click same star twice) → undefined means "no override stored",
    // whereas 0 would mean "override with zero", which are semantically different.
    const nextRating: number | undefined = rating === starValue ? undefined : starValue;
    updateSongInfo((prevData) => ({ ...prevData, rating: nextRating }));
  };

  return (
    <div className="tag-input flex max-w-2xl min-w-[10rem] flex-col">
      <div className="flex items-center justify-between mr-[10%] mb-2">
        <label>{t('songTagsEditingPage.rating')}</label>
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
              {star <= (rating ?? 0) ? 'star' : 'star_border'}
            </span>
          </button>
        ))}
        <span className="ml-3 text-sm opacity-70">
          {rating !== undefined && rating > 0 ? `${rating} / 5` : ''}
        </span>
      </div>
    </div>
  );
};

export default SongRatingInput;
