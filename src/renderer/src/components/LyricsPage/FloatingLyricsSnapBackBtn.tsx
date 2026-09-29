import { memo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

interface FloatingLyricsSnapBackBtnProps {
  direction: 'up' | 'down';
  onClick: () => void;
  className?: string;
}

export const FloatingLyricsSnapBackBtn: FC<FloatingLyricsSnapBackBtnProps> = memo(
  ({ direction, onClick, className = '' }) => {
    const { t } = useTranslation();
    const isUp = direction === 'up';

    return (
      <button
        type="button"
        onClick={onClick}
        title={t('lyricsPage.scrollToCurrentLine', 'Scroll to current line')}
        className={`bg-accent text-white absolute left-1/2 z-40 flex -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-2xl backdrop-blur-md transition-all hover:scale-105 hover:shadow-accent/40 active:scale-95 [-webkit-app-region:no-drag] ${
          isUp ? 'top-12' : 'bottom-6'
        } ${className}`}
      >
        <span className="material-symbols-rounded text-base">
          {isUp ? 'keyboard_double_arrow_up' : 'keyboard_double_arrow_down'}
        </span>
        <span>{t('lyricsPage.currentLine', 'Current line')}</span>
      </button>
    );
  }
);

FloatingLyricsSnapBackBtn.displayName = 'FloatingLyricsSnapBackBtn';
export default FloatingLyricsSnapBackBtn;
