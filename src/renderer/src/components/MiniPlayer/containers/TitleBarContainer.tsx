import { settingsQuery } from '@renderer/queries/settings';
import { store } from '@renderer/store/store';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { useContext } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../../contexts/AppUpdateContext';
import Button from '../../Button';
import { CloseIcon, MinimizeIcon } from '../../Icons/WindowIcons';

type Props = { isLyricsVisible: boolean };

const TitleBarContainer = (props: Props) => {
  const isCurrentSongPlaying = useStore(store, (state) => state.player.isCurrentSongPlaying);
  const {
    data: { hideWindowOnClose }
  } = useSuspenseQuery({
    ...settingsQuery.all,
    select: (data) => ({
      hideWindowOnClose: data.hideWindowOnClose
    })
  });

  const { updatePlayerType } = useContext(AppUpdateContext);
  const { t } = useTranslation();

  const { isLyricsVisible } = props;

  return (
    <div
      className={`mini-player-title-bar z-10 flex h-[15%] max-h-[2.25rem] w-full justify-end opacity-0 transition-[visibility,opacity] select-none [-webkit-app-region:drag] group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 ${
        !isCurrentSongPlaying ? 'visible opacity-100' : ''
      }`}
    >
      <div
        className={`special-controls-container flex transition-[visibility,opacity] [-webkit-app-region:no-drag] ${
          isLyricsVisible
            ? 'invisible opacity-0 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100'
            : ''
        } ${!isCurrentSongPlaying ? 'visible! opacity-100!' : ''}`}
      >
        <Button
          className="go-to-main-player-btn text-font-color-white dark:text-font-color-white mt-1! mr-0! rounded-md! border-0! bg-transparent! p-2! outline-offset-1 [-webkit-app-region:no-drag] focus-visible:outline!"
          tooltipLabel={t('player.goToMainPlayer')}
          iconName="pip_exit"
          iconClassName="material-icons-round-outlined text-xl!"
          clickHandler={() => updatePlayerType('normal')}
          removeFocusOnClick
        />
      </div>
      <div className="window-controls-container flex [-webkit-app-region:no-drag]">
        <button
          type="button"
          className="minimize-btn m-0! flex h-full w-9 cursor-pointer items-center justify-center rounded-none! border-0! bg-transparent! text-font-color-white -outline-offset-2 transition-[background] ease-in-out hover:bg-[hsla(0deg,0%,80%,0.5)]! focus-visible:outline!"
          onClick={() => window.api.windowControls.minimizeApp()}
          title={t('titleBar.minimize')}
        >
          <MinimizeIcon className="h-2.5 w-2.5" />
        </button>
        <button
          type="button"
          className="close-btn hover:bg-font-color-crimson! hover:text-font-color-white! m-0! flex h-full w-9 cursor-pointer items-center justify-center rounded-none! border-0! bg-transparent! text-font-color-white -outline-offset-2 transition-[background] ease-in-out focus-visible:outline!"
          onClick={() => {
            if (hideWindowOnClose) window.api.windowControls.hideApp();
            else window.api.windowControls.closeApp();
          }}
          title={t('titleBar.close')}
        >
          <CloseIcon className="h-2.5 w-2.5" />
        </button>
      </div>
    </div>
  );
};

export default TitleBarContainer;
