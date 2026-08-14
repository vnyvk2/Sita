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
      className="window-controls-container ml-6 flex h-full items-center justify-between"
      id="window-controls-container"
    >
      <button
        type="button"
        className={`minimize-btn !m-0 flex h-full cursor-pointer items-center justify-center !rounded-none !border-0 bg-transparent !px-3 text-font-color-black transition-[background,color] ease-in-out hover:!bg-[hsla(0deg,0%,80%,0.5)] focus-visible:!outline dark:bg-transparent dark:text-font-color-white ${
          bodyBackgroundImage && 'text-font-color-white!'
        } `}
        onClick={minimize}
        title={t('titleBar.minimize')}
      >
        <MinimizeIcon className="h-3 w-3" />
      </button>
      <button
        type="button"
        className={`maximize-btn !m-0 flex h-full cursor-pointer items-center justify-center !rounded-none !border-0 bg-transparent !px-3 text-font-color-black transition-[background,color] ease-in-out hover:!bg-[hsla(0deg,0%,80%,0.5)] focus-visible:!outline dark:bg-transparent dark:text-font-color-white ${
          bodyBackgroundImage && 'text-font-color-white!'
        } `}
        onClick={maximize}
        title={t('titleBar.maximize')}
      >
        <MaximizeIcon className="h-3 w-3" />
      </button>
      <button
        type="button"
        className={`close-btn hover:!bg-font-color-crimson hover:!text-font-color-white !m-0 flex h-full cursor-pointer items-center justify-center !rounded-none !border-0 bg-transparent !px-3 text-font-color-black transition-[background,color] ease-in-out focus-visible:!outline dark:bg-transparent dark:text-font-color-white ${
          bodyBackgroundImage && 'text-font-color-white!'
        } `}
        onClick={close}
        title={t('titleBar.close')}
      >
        <CloseIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default WindowControlsContainer;
