import { useSuspenseQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { settingsQuery } from '../../queries/settings';
import { store } from '../../store/store';
import { CloseIcon, MaximizeIcon, MinimizeIcon } from '../Icons/WindowIcons';

const WindowControlsContainer = () => {
  const bodyBackgroundImage = useStore(store, (state) => state.bodyBackgroundImage);
  const {
    data: { hideWindowOnClose }
  } = useSuspenseQuery({
    ...settingsQuery.all,
    select: (data) => ({ hideWindowOnClose: data.hideWindowOnClose })
  });

  const { t } = useTranslation();

  const close = useCallback(() => {
    if (hideWindowOnClose) window.api.windowControls.hideApp();
    else window.api.windowControls.closeApp();
  }, [hideWindowOnClose]);

  const minimize = useCallback(() => window.api.windowControls.minimizeApp(), []);
  const maximize = useCallback(() => window.api.windowControls.toggleMaximizeApp(), []);

  return (
    <div
      className="window-controls-container flex h-full items-center justify-end bg-background-color-2/70 dark:bg-dark-background-color-2/80 [-webkit-app-region:no-drag]"
      id="window-controls-container"
    >
      <button
        type="button"
        className={`minimize-btn m-0 flex h-full w-10 cursor-pointer items-center justify-center rounded-none border-0 bg-transparent text-font-color-black/80 transition-colors ease-in-out hover:bg-background-color-3/60 hover:text-font-color-black focus-visible:outline-hidden dark:text-font-color-white/80 dark:hover:bg-dark-background-color-3/60 dark:hover:text-font-color-white ${
          bodyBackgroundImage && 'text-font-color-white!'
        }`}
        onClick={minimize}
        title={t('titleBar.minimize')}
      >
        <MinimizeIcon className="h-2.5 w-2.5" />
      </button>
      <button
        type="button"
        className={`maximize-btn m-0 flex h-full w-10 cursor-pointer items-center justify-center rounded-none border-0 bg-transparent text-font-color-black/80 transition-colors ease-in-out hover:bg-background-color-3/60 hover:text-font-color-black focus-visible:outline-hidden dark:text-font-color-white/80 dark:hover:bg-dark-background-color-3/60 dark:hover:text-font-color-white ${
          bodyBackgroundImage && 'text-font-color-white!'
        }`}
        onClick={maximize}
        title={t('titleBar.maximize')}
      >
        <MaximizeIcon className="h-2.5 w-2.5" />
      </button>
      <button
        type="button"
        className={`close-btn m-0 flex h-full w-10 cursor-pointer items-center justify-center rounded-none border-0 bg-transparent text-font-color-black/80 transition-colors ease-in-out hover:bg-[#e81123] hover:text-white focus-visible:outline-hidden dark:text-font-color-white/80 dark:hover:bg-[#e81123] dark:hover:text-white ${
          bodyBackgroundImage && 'text-font-color-white!'
        }`}
        onClick={close}
        title={t('titleBar.close')}
      >
        <CloseIcon className="h-2.5 w-2.5" />
      </button>
    </div>
  );
};

export default WindowControlsContainer;
