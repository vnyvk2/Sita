import { dispatch, store } from '@renderer/store/store';
import { useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { lazy, useCallback, useContext, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { useOverlayNavigation } from '../../hooks/useOverlayNavigation';
import storage from '../../utils/localStorage';
import Button from '../Button';
import QueueIcon from '../Icons/QueueIcon';
import KaraokeSlider from '../KaraokeSlider';
import NavLink from '../NavLink';
import VolumeSlider from '../VolumeSlider';

const AppShortcutsPrompt = lazy(() => import('../SettingsPage/AppShortcutsPrompt'));
const AudioFxModal = lazy(() => import('./AudioFxModal'));

const DEFAULT_CONTROLS_IN_3_DOTS: Required<PlayerBarControlsIn3Dots> = {
  miniPlayer: true,
  fullscreen: true,
  floatingLyrics: true,
  audioFx: false,
  karaoke: false,
  queue: false
};

const OtherSongControlsContainer = () => {
  const currentlyActivePage = useStore(store, (state) => state.currentlyActivePage);
  const isMuted = useStore(store, (state) => state.player.volume.isMuted);
  const volume = useStore(store, (state) => state.player.volume.value);
  const audioFxPreset = useStore(
    store,
    (state) => state.localStorage?.playback?.audioFx?.preset ?? 'normal'
  );
  const isKaraoke = useStore(store, (state) => state.localStorage?.playback?.isKaraoke ?? false);
  const karaokeLevel = useStore(
    store,
    (state) => state.localStorage?.playback?.karaokeLevel ?? 100
  );

  const rawControlsIn3Dots = useStore(
    store,
    (state) => state.localStorage?.preferences?.playerBarControlsIn3Dots
  );
  const controlsIn3Dots = useMemo(
    () => ({
      ...DEFAULT_CONTROLS_IN_3_DOTS,
      ...(rawControlsIn3Dots || {})
    }),
    [rawControlsIn3Dots]
  );

  const menuCoordsRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const { updatePlayerType, toggleMutedState, updateContextMenuData, changePromptMenuData } =
    useContext(AppUpdateContext);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toggleOverlay } = useOverlayNavigation();

  const openOtherSettingsContextMenu = useCallback(
    (pageX: number, pageY: number, activeControls?: typeof controlsIn3Dots) => {
      menuCoordsRef.current = { x: pageX, y: pageY };
      const currentControls = activeControls ?? controlsIn3Dots;

      const handleToggle = (key: keyof PlayerBarControlsIn3Dots) => {
        const updated = {
          ...currentControls,
          [key]: !currentControls[key]
        };
        storage.preferences.setPreferences('playerBarControlsIn3Dots', updated);
        openOtherSettingsContextMenu(pageX, pageY, updated);
      };

      const handleReset = () => {
        storage.preferences.setPreferences('playerBarControlsIn3Dots', DEFAULT_CONTROLS_IN_3_DOTS);
        openOtherSettingsContextMenu(pageX, pageY, DEFAULT_CONTROLS_IN_3_DOTS);
      };

      const items: ContextMenuItem[] = [];

      // 1. Actions currently pushed into 3-dots
      if (currentControls.miniPlayer) {
        items.push(
          {
            label: t('player.showMiniPlayer'),
            iconName: 'pip',
            iconClassName: 'material-icons-round-outlined mr-2',
            handlerFunction: () => updatePlayerType('mini', 'standard')
          },
          {
            label: t('player.showCompactPlayer', 'Show Compact Player'),
            iconName: 'compress',
            iconClassName: 'material-icons-round-outlined mr-2',
            handlerFunction: () => updatePlayerType('mini', 'compact')
          }
        );
      }

      if (currentControls.fullscreen) {
        items.push({
          label: t('player.openInFullScreen'),
          iconName: 'fullscreen',
          iconClassName: 'material-icons-round-outlined mr-2',
          handlerFunction: () => updatePlayerType('full')
        });
      }

      if (currentControls.floatingLyrics) {
        items.push({
          label: t('lyrics.floatingLyrics', 'Desktop Floating Lyrics'),
          iconName: 'subtitles',
          iconClassName: 'material-icons-round-outlined mr-2',
          handlerFunction: () => window.api.windowControls.toggleFloatingLyrics()
        });
      }

      if (currentControls.audioFx) {
        items.push({
          label: t('audioFx.title', 'Audio Effects'),
          iconName: 'graphic_eq',
          iconClassName: 'material-icons-round-outlined mr-2',
          handlerFunction: () =>
            changePromptMenuData(
              true,
              <AudioFxModal />,
              'audio-fx-modal-dialog w-[860px] max-w-[94vw]'
            )
        });
      }

      if (currentControls.karaoke) {
        items.push({
          label: isKaraoke
            ? t('player.disableKaraoke', 'Disable Karaoke Mode')
            : t('player.enableKaraoke', 'Enable Karaoke Mode'),
          iconName: 'mic_off',
          iconClassName: 'material-icons-round-outlined mr-2',
          handlerFunction: () => dispatch({ type: 'TOGGLE_KARAOKE_MODE' })
        });
      }

      if (currentControls.queue) {
        items.push({
          label: t('player.showCurrentQueue'),
          iconName: 'queue_music',
          iconClassName: 'material-icons-round-outlined mr-2',
          handlerFunction: () => toggleOverlay('/main-player/queue')
        });
      }

      if (items.length > 0) {
        items.push({ label: '', isContextMenuItemSeperator: true, handlerFunction: () => true });
      }

      // 2. Control Panel submenu with interactive checkboxes
      items.push({
        label: t('player.controlPanel', 'Control Panel'),
        iconName: 'tune',
        iconClassName: 'material-icons-round-outlined mr-2',
        handlerFunction: () => true,
        innerContextMenus: [
          {
            label: t('player.showMiniPlayer', 'Mini Player'),
            iconName: currentControls.miniPlayer ? 'check_box' : 'check_box_outline_blank',
            iconClassName: `material-icons-round mr-2 ${
              currentControls.miniPlayer
                ? 'text-font-color-highlight! dark:text-dark-font-color-highlight!'
                : 'opacity-50'
            }`,
            preventClosingOnClick: true,
            handlerFunction: () => handleToggle('miniPlayer')
          },
          {
            label: t('player.openInFullScreen', 'Full Screen'),
            iconName: currentControls.fullscreen ? 'check_box' : 'check_box_outline_blank',
            iconClassName: `material-icons-round mr-2 ${
              currentControls.fullscreen
                ? 'text-font-color-highlight! dark:text-dark-font-color-highlight!'
                : 'opacity-50'
            }`,
            preventClosingOnClick: true,
            handlerFunction: () => handleToggle('fullscreen')
          },
          {
            label: t('lyrics.floatingLyrics', 'Desktop Floating Lyrics'),
            iconName: currentControls.floatingLyrics ? 'check_box' : 'check_box_outline_blank',
            iconClassName: `material-icons-round mr-2 ${
              currentControls.floatingLyrics
                ? 'text-font-color-highlight! dark:text-dark-font-color-highlight!'
                : 'opacity-50'
            }`,
            preventClosingOnClick: true,
            handlerFunction: () => handleToggle('floatingLyrics')
          },
          {
            label: t('audioFx.title', 'Audio Effects'),
            iconName: currentControls.audioFx ? 'check_box' : 'check_box_outline_blank',
            iconClassName: `material-icons-round mr-2 ${
              currentControls.audioFx
                ? 'text-font-color-highlight! dark:text-dark-font-color-highlight!'
                : 'opacity-50'
            }`,
            preventClosingOnClick: true,
            handlerFunction: () => handleToggle('audioFx')
          },
          {
            label: t('player.karaoke', 'Karaoke Mode'),
            iconName: currentControls.karaoke ? 'check_box' : 'check_box_outline_blank',
            iconClassName: `material-icons-round mr-2 ${
              currentControls.karaoke
                ? 'text-font-color-highlight! dark:text-dark-font-color-highlight!'
                : 'opacity-50'
            }`,
            preventClosingOnClick: true,
            handlerFunction: () => handleToggle('karaoke')
          },
          {
            label: t('player.currentQueue', 'Current Queue'),
            iconName: currentControls.queue ? 'check_box' : 'check_box_outline_blank',
            iconClassName: `material-icons-round mr-2 ${
              currentControls.queue
                ? 'text-font-color-highlight! dark:text-dark-font-color-highlight!'
                : 'opacity-50'
            }`,
            preventClosingOnClick: true,
            handlerFunction: () => handleToggle('queue')
          },
          { label: '', isContextMenuItemSeperator: true, handlerFunction: () => true },
          {
            label: t('common.resetToDefault', 'Reset to Default'),
            iconName: 'restart_alt',
            iconClassName: 'material-icons-round mr-2 opacity-70',
            preventClosingOnClick: true,
            handlerFunction: () => handleReset()
          }
        ]
      });

      // 3. Audio & System settings
      items.push(
        { label: '', isContextMenuItemSeperator: true, handlerFunction: () => true },
        {
          label: t('settingsPage.audioPlayback'),
          iconName: 'tune',
          iconClassName: 'material-icons-round-outlined mr-2',
          handlerFunction: () =>
            navigate({ to: '/main-player/settings', hash: 'audio-playback-settings-container' })
        },
        {
          label: isMuted ? t('player.unmute') : t('player.mute'),
          iconName: isMuted ? 'volume_off' : 'volume_up',
          iconClassName: 'material-icons-round-outlined mr-2',
          handlerFunction: () => toggleMutedState()
        },
        {
          label: t('settingsPage.settings'),
          iconName: 'settings',
          iconClassName: 'material-icons-round-outlined mr-2',
          handlerFunction: () => navigate({ to: '/main-player/settings' })
        },
        {
          label: t('settingsPage.appShortcuts'),
          iconName: 'keyboard',
          iconClassName: 'material-icons-round-outlined mr-2',
          handlerFunction: () => changePromptMenuData(true, <AppShortcutsPrompt />)
        }
      );

      updateContextMenuData(true, items, pageX, pageY);
    },
    [
      changePromptMenuData,
      controlsIn3Dots,
      isKaraoke,
      isMuted,
      navigate,
      t,
      toggleMutedState,
      toggleOverlay,
      updateContextMenuData,
      updatePlayerType
    ]
  );

  return (
    <div className="other-controls-container flex items-center justify-end">
      {!controlsIn3Dots.queue && (
        <NavLink
          to="/main-player/queue"
          onClick={(e) => {
            e.preventDefault();
            toggleOverlay('/main-player/queue');
          }}
          className={`queue-btn text-font-color-black text-opacity-60 after:bg-font-color-highlight dark:text-font-color-white dark:after:bg-dark-font-color-highlight !mr-6 !rounded-none !border-0 bg-transparent !p-0 outline-offset-1 after:absolute after:h-1 after:w-1 after:translate-y-4 after:rounded-full after:opacity-0 after:transition-opacity hover:bg-transparent focus-visible:!outline lg:hidden dark:bg-transparent dark:hover:bg-transparent ${
            currentlyActivePage.pageTitle === 'CurrentQueue' && 'after:opacity-100'
          }`}
          title={t('player.currentQueue')}
        >
          <QueueIcon className="group-[.active]:text-font-color-highlight dark:group-[.active]:text-dark-font-color-highlight h-6 w-6 opacity-60 transition-[color,opacity] group-[.active]:opacity-100 hover:opacity-80" />
        </NavLink>
      )}

      {!controlsIn3Dots.miniPlayer && (
        <Button
          className="mini-player-btn text-font-color-black text-opacity-60 dark:text-font-color-white mr-6! rounded-none! border-0! bg-transparent p-0! outline-offset-1 hover:bg-transparent focus-visible:outline! lg:hidden dark:bg-transparent dark:hover:bg-transparent"
          clickHandler={() => updatePlayerType('mini')}
          tooltipLabel={t('player.openInMiniPlayer')}
          iconName="pip"
          iconClassName="material-icons-round-outlined icon cursor-pointer text-xl text-font-color-black opacity-60 transition-opacity hover:opacity-80 dark:text-font-color-white"
        />
      )}

      {!controlsIn3Dots.fullscreen && (
        <Button
          className="full-screen-player-btn text-font-color-black text-opacity-60 after:bg-font-color-highlight dark:text-font-color-white dark:after:bg-dark-font-color-highlight mr-6! rounded-none! border-0! bg-transparent p-0! outline-offset-1 after:absolute after:h-1 after:w-1 after:translate-y-4 after:rounded-full after:opacity-0 after:transition-opacity hover:bg-transparent focus-visible:outline! lg:hidden dark:bg-transparent dark:hover:bg-transparent"
          tooltipLabel={t('player.openInFullScreen')}
          iconName="fullscreen"
          iconClassName="material-icons-round-outlined text-xl text-font-color-black opacity-60 transition-opacity hover:opacity-80 dark:text-font-color-white"
          clickHandler={() => updatePlayerType('full')}
        />
      )}

      {!controlsIn3Dots.audioFx && (
        <Button
          className={`audio-fx-btn text-font-color-black text-opacity-60 after:bg-font-color-highlight dark:text-font-color-white dark:after:bg-dark-font-color-highlight relative mr-6! rounded-none! border-0! bg-transparent p-0! outline-offset-1 after:absolute after:h-1 after:w-1 after:translate-y-4 after:rounded-full after:opacity-0 after:transition-opacity hover:bg-transparent focus-visible:outline! lg:hidden dark:bg-transparent dark:hover:bg-transparent ${
            audioFxPreset !== 'normal' ? 'after:opacity-100' : ''
          }`}
          tooltipLabel={`${t('audioFx.title', 'Audio Effects')}${audioFxPreset !== 'normal' ? ` (${audioFxPreset})` : ''}`}
          iconName="graphic_eq"
          iconClassName={`material-icons-round text-xl transition-all ${
            audioFxPreset !== 'normal'
              ? 'text-font-color-highlight! dark:text-dark-font-color-highlight! opacity-100 scale-105'
              : 'text-font-color-black opacity-60 hover:opacity-80 dark:text-font-color-white'
          }`}
          clickHandler={() =>
            changePromptMenuData(
              true,
              <AudioFxModal />,
              'audio-fx-modal-dialog w-[860px] max-w-[94vw]'
            )
          }
        />
      )}

      {!controlsIn3Dots.floatingLyrics && (
        <Button
          className="floating-lyrics-btn text-font-color-black text-opacity-60 relative mr-6! rounded-none! border-0! bg-transparent p-0! outline-offset-1 hover:bg-transparent focus-visible:outline! lg:hidden dark:bg-transparent dark:hover:bg-transparent"
          tooltipLabel={t('lyrics.floatingLyrics', 'Desktop Floating Lyrics (Ctrl+Shift+L)')}
          iconName="subtitles"
          iconClassName="material-icons-round text-xl text-font-color-black opacity-60 hover:opacity-80 dark:text-font-color-white"
          clickHandler={() => window.api.windowControls.toggleFloatingLyrics()}
        />
      )}

      {!controlsIn3Dots.karaoke && (
        <div className="group/karaoke relative flex items-center">
          <Button
            className={`karaoke-btn text-font-color-black text-opacity-60 after:bg-font-color-highlight dark:text-font-color-white dark:after:bg-dark-font-color-highlight relative rounded-none! border-0! bg-transparent p-0! outline-offset-1 after:absolute after:h-1 after:w-1 after:translate-y-4 after:rounded-full after:opacity-0 after:transition-opacity hover:bg-transparent focus-visible:outline! lg:hidden dark:bg-transparent dark:hover:bg-transparent ${
              isKaraoke ? 'after:opacity-100' : ''
            }`}
            ariaPressed={isKaraoke}
            tooltipLabel={`${t('player.karaokeTooltip', 'Toggle Karaoke Mode (Vocal Reducer)')}${isKaraoke ? ` (${Math.round(karaokeLevel)}%)` : ''}`}
            iconName="mic_off"
            iconClassName={`material-icons-round text-xl transition-all ${
              isKaraoke
                ? 'text-font-color-highlight! dark:text-dark-font-color-highlight! opacity-100 scale-105'
                : 'text-font-color-black opacity-60 hover:opacity-80 dark:text-font-color-white'
            }`}
            clickHandler={() => dispatch({ type: 'TOGGLE_KARAOKE_MODE' })}
          />

          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out lg:hidden ${
              isKaraoke
                ? 'mr-6 ml-2 max-w-[5.5rem] min-w-[3.5rem] opacity-100'
                : 'mr-6 max-w-0 opacity-0 group-hover/karaoke:ml-2 group-hover/karaoke:max-w-[5.5rem] group-hover/karaoke:min-w-[3.5rem] group-hover/karaoke:opacity-100'
            }`}
          >
            <KaraokeSlider name="player-karaoke-slider" id="karaokeSlider" />
          </div>
        </div>
      )}

      <Button
        className={`volume-btn after:bg-font-color-highlight dark:after:bg-dark-font-color-highlight !mr-2 !rounded-none !border-0 bg-transparent !p-0 outline-offset-1 after:absolute after:h-1 after:w-1 after:translate-y-4 after:rounded-full after:opacity-0 after:transition-opacity hover:bg-transparent focus-visible:!outline dark:bg-transparent dark:hover:bg-transparent ${
          isMuted && 'after:opacity-100'
        }`}
        tooltipLabel={t('player.muteUnmute')}
        iconName={isMuted ? 'volume_off' : volume > 50 ? 'volume_up' : 'volume_down_alt'}
        iconClassName={`material-icons-round text-xl text-font-color-black opacity-60 transition-opacity hover:opacity-80 dark:text-font-color-white ${
          isMuted && 'text-font-color-highlight! opacity-100! dark:text-dark-font-color-highlight!'
        }`}
        clickHandler={() => toggleMutedState(!isMuted)}
      />

      <div className="volume-slider-container mr-4 max-w-[6rem] min-w-[4rem] lg:mr-4">
        <VolumeSlider name="player-volume-slider" id="volumeSlider" />
      </div>

      <Button
        className="other-settings-btn more-options-btn text-font-color-black text-opacity-60 dark:text-font-color-white mr-4! rounded-none! border-0! bg-transparent p-0! outline-offset-1 hover:bg-transparent focus-visible:outline! dark:bg-transparent dark:hover:bg-transparent"
        tooltipLabel={t('common.moreOptions', 'More options')}
        iconName="more_vert"
        iconClassName="material-icons-round text-xl text-font-color-black opacity-60 transition-opacity hover:opacity-80 dark:text-font-color-white"
        clickHandler={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const coords = (e.currentTarget as HTMLElement).getBoundingClientRect();
          openOtherSettingsContextMenu(coords.x, coords.y);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          openOtherSettingsContextMenu(e.pageX, e.pageY);
        }}
      />
    </div>
  );
};

export default OtherSongControlsContainer;
