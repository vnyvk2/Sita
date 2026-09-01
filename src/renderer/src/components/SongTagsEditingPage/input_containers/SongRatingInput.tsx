import { useState } from 'react';
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

  const [hoverRating, setHoverRating] = useState<number | null>(null);

  const activeRating = hoverRating ?? rating ?? 0;

  const handleRatingClick = (targetValue: number) => {
    // Toggle off if clicking the currently selected rating
    const nextRating = rating === targetValue ? undefined : targetValue;
    updateSongInfo((prevData) => ({ ...prevData, rating: nextRating }));
  };

  const renderStarIcon = (starIndex: number) => {
    // starIndex ranges from 1 to 5
    if (activeRating >= starIndex) {
      return 'star';
    }
    if (activeRating >= starIndex - 0.5) {
      return 'star_half';
    }
    return 'star_border';
  };

  const isStarFilled = (starIndex: number) => {
    return activeRating >= starIndex - 0.5;
  };

  return (
    <div className="tag-input flex max-w-2xl min-w-[10rem] flex-col">
      <div className="mr-[10%] mb-2 flex items-center justify-between">
        <label className="text-font-color-black dark:text-font-color-white text-sm font-medium">
          {t('songTagsEditingPage.rating')}
        </label>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="text-font-color-highlight dark:text-dark-font-color-highlight text-xs opacity-80 transition-opacity hover:underline hover:opacity-100"
          >
            {t('resetTagsToDefaultPrompt.resetToDefault')}
          </button>
        )}
      </div>

      <div className="flex items-center space-x-2 py-1" onMouseLeave={() => setHoverRating(null)}>
        {[1, 2, 3, 4, 5].map((starIndex) => {
          const icon = renderStarIcon(starIndex);
          const isFilled = isStarFilled(starIndex);

          return (
            <div
              key={starIndex}
              className="group relative inline-flex cursor-pointer items-center justify-center transition-transform select-none hover:scale-110"
              title={`${starIndex - 0.5} - ${starIndex} Stars`}
            >
              {/* Left half hit target */}
              <div
                className="absolute top-0 bottom-0 left-0 z-10 w-1/2"
                onMouseEnter={() => setHoverRating(starIndex - 0.5)}
                onClick={() => handleRatingClick(starIndex - 0.5)}
              />
              {/* Right half hit target */}
              <div
                className="absolute top-0 right-0 bottom-0 z-10 w-1/2"
                onMouseEnter={() => setHoverRating(starIndex)}
                onClick={() => handleRatingClick(starIndex)}
              />

              {/* Icon rendering: Gold when filled/half, Silver/Muted when empty */}
              <span
                className={`material-icons-round text-3xl transition-colors duration-150 ${
                  isFilled
                    ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)] dark:text-yellow-400'
                    : 'text-slate-400/60 hover:text-slate-400 dark:text-zinc-500/50 dark:hover:text-zinc-400'
                }`}
              >
                {icon}
              </span>
            </div>
          );
        })}

        <span className="ml-3 min-w-[3.5rem] text-sm font-medium opacity-80">
          {activeRating > 0 ? `${activeRating.toFixed(1).replace(/\.0$/, '')} / 5` : 'Unrated'}
        </span>
      </div>
    </div>
  );
};

export default SongRatingInput;
