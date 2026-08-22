/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { memo, useContext } from 'react';

import { AppUpdateContext } from '../../contexts/AppUpdateContext';

type Props = {
  isActive?: boolean;
  isHighlighted?: boolean;
  start: number;
  end?: number;
  delay?: number;
  text: string;
};

const EnhancedSyncedLyricWord = memo((props: Props) => {
  const { updateSongPosition } = useContext(AppUpdateContext);
  const { isActive = false, isHighlighted = false, start, text } = props;

  return (
    <span
      onClick={() => updateSongPosition(start)}
      className={`text-font-color-black dark:text-font-color-white mr-2 transition-colors last:mr-0 ${
        isHighlighted
          ? 'text-font-color-highlight/90 dark:text-font-color-highlight/90'
          : isActive
            ? 'text-font-color-black/50 dark:text-font-color-white/50'
            : 'text-font-color-black/20 dark:text-font-color-white/20 hover:text-font-color-black/75! dark:hover:text-font-color-white/75!'
      }`}
    >
      {text}
    </span>
  );
});

EnhancedSyncedLyricWord.displayName = 'EnhancedSyncedLyricWord';

export default EnhancedSyncedLyricWord;
