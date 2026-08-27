import { dispatch, store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import i18n from '../../../i18n';
import storage from '../../../utils/localStorage';
import Button from '../../Button';
import Checkbox from '../../Checkbox';
import Dropdown, { type DropdownOption } from '../../Dropdown';

const second = i18n.t('settingsPage.second');
const seconds = i18n.t('settingsPage.second_other');

const seekbarScrollIntervals: DropdownOption<string>[] = [
  { label: `1 ${second}`, value: '1' },
  { label: `2.5 ${seconds}`, value: '2.5' },
  { label: `5 ${seconds}`, value: '5' },
  { label: `10 ${seconds}`, value: '10' },
  { label: `15 ${seconds}`, value: '15' },
  { label: `20 ${seconds}`, value: '20' }
];

const replayGainModeOptions: DropdownOption<string>[] = [
  { label: 'Track Gain (Recommended for mixed playlists)', value: 'track' },
  { label: 'Album Gain (Preserves album dynamics)', value: 'album' },
  { label: 'Off (No loudness normalization)', value: 'off' }
];

const AudioPlaybackSettings = () => {
  const preferences = useStore(store, (state) => state.localStorage.preferences);

  const { t } = useTranslation();

  const [seekbarScrollInterval, setSeekbarScrollInterval] = useState('5');
  const [playbackRateInterval, setPlaybackRateInterval] = useState(1);

  const [replayGainMode, setReplayGainMode] = useState<'track' | 'album' | 'off'>('track');
  const [preampDb, setPreampDb] = useState(0);
  const [preventClipping, setPreventClipping] = useState(true);

  useEffect(() => {
    const interval = storage.preferences.getPreferences('seekbarScrollInterval');
    const playbackRate = storage.playback.getPlaybackOptions('playbackRate');
    const rg = storage.playback.getPlaybackOptions('replayGain');

    setPlaybackRateInterval(playbackRate);
    setSeekbarScrollInterval(interval.toString());

    if (rg) {
      if (rg.mode) setReplayGainMode(rg.mode);
      if (typeof rg.preampDb === 'number') setPreampDb(rg.preampDb);
      if (typeof rg.preventClipping === 'boolean') setPreventClipping(rg.preventClipping);
    }
  }, []);

  const updateReplayGain = (
    updated: Partial<{ mode: 'track' | 'album' | 'off'; preampDb: number; preventClipping: boolean }>
  ) => {
    const current = storage.playback.getPlaybackOptions('replayGain') ?? {
      mode: 'track',
      preampDb: 0,
      preventClipping: true
    };
    const next = { ...current, ...updated };
    storage.playback.setPlaybackOptions('replayGain', next);
    dispatch({ type: 'UPDATE_LOCAL_STORAGE', data: storage.getLocalStorage() });
  };

  const playbackRateSeekBarCssProperties: CSSProperties = {};

  playbackRateSeekBarCssProperties['--seek-before-width'] = `${
    ((playbackRateInterval - 0.25) / (4 - 0.25)) * 100
  }%`;

  return (
    <li
      className="main-container audio-playback-settings-container mb-16"
      id="audio-playback-settings-container"
    >
      <div className="title-container text-font-color-highlight dark:text-dark-font-color-highlight mt-1 mb-4 flex items-center text-2xl font-medium">
        <span className="material-icons-round-outlined mr-2">slow_motion_video</span>
        {t('settingsPage.audioPlayback')}
      </div>
      <ul className="marker:bg-font-color-highlight dark:marker:bg-dark-font-color-highlight list-disc pl-6">
        <li className="secondary-container show-remaining-song-duration mb-4">
          <div className="description">
            {t('settingsPage.showRemainingSongDurationDescription')}
          </div>
          <Checkbox
            id="toggleShowRemainingSongDuration"
            isChecked={preferences?.showSongRemainingTime}
            checkedStateUpdateFunction={(state) =>
              storage.preferences.setPreferences('showSongRemainingTime', state)
            }
            labelContent={t('settingsPage.showRemainingSongDuration')}
          />
        </li>

        <li className="playback-rate mb-6" id="playbackRateInterval">
          <div className="description">{t('settingsPage.changePlaybackRate')}</div>
          <div className="mt-6 flex items-center">
            <div className="flex w-1/2 min-w-[120px] flex-col items-center justify-center">
              <span className="text-font-color-highlight dark:text-dark-font-color-highlight">
                {t('settingsPage.playbackRate')}: {playbackRateInterval} x
              </span>
              <div className="flex w-full items-center pl-2">
                <span className="text-sm">0.25x</span>
                <input
                  type="range"
                  name="seek-bar-slider"
                  id="seek-bar-slider"
                  className="seek-bar-slider thumb-visible before:bg-font-color-highlight hover:before:bg-font-color-highlight dark:before:bg-font-color-highlight dark:hover:before:bg-dark-font-color-highlight relative float-left mx-4 h-6 w-full appearance-none bg-transparent p-0 outline-hidden outline-offset-1 before:absolute before:top-1/2 before:left-0 before:h-1 before:w-(--seek-before-width) before:-translate-y-1/2 before:cursor-pointer before:rounded-3xl before:transition-[width,background] before:content-[''] focus-visible:outline!"
                  min={0.25}
                  step={0.05}
                  max={4.0}
                  value={playbackRateInterval || 1}
                  onChange={(e) => {
                    const val = e.currentTarget.valueAsNumber;
                    setPlaybackRateInterval(val);
                    storage.playback.setPlaybackOptions('playbackRate', val);
                    dispatch({ type: 'UPDATE_PLAYBACK_RATE', data: val });
                  }}
                  style={playbackRateSeekBarCssProperties}
                  title={`${playbackRateInterval}x`}
                />
                <span className="text-sm">4x</span>
              </div>
            </div>
            <Button
              label={t('settingsPage.resetPlaybackRate')}
              iconName="restart_alt"
              className="ml-6"
              isDisabled={playbackRateInterval === 1}
              clickHandler={() => {
                setPlaybackRateInterval(1);
                storage.playback.setPlaybackOptions('playbackRate', 1);
                dispatch({ type: 'UPDATE_PLAYBACK_RATE', data: 1 });
              }}
            />
          </div>
        </li>

        <li className="seekbar-scroll-interval mb-6">
          <div className="description">{t('settingsPage.seekbarScrollInterval')}</div>
          <Dropdown
            className="mt-4"
            name="seekbarScrollInterval"
            value={seekbarScrollInterval?.toString()}
            options={seekbarScrollIntervals}
            onChange={(e) => {
              const val = e.currentTarget.value;
              setSeekbarScrollInterval(val);
              storage.preferences.setPreferences('seekbarScrollInterval', parseFloat(val));
            }}
          />
        </li>

        <li className="replay-gain-settings mb-6" id="replayGainSettings">
          <div className="title font-medium text-lg text-font-color-highlight dark:text-dark-font-color-highlight mb-1">
            Loudness Normalization (ReplayGain / ITU-R BS.1770)
          </div>
          <div className="description text-sm opacity-80 mb-3">
            Automatically adjusts track and album playback volume to a consistent standard loudness (-18 LUFS).
          </div>

          <div className="mb-4">
            <label htmlFor="replayGainModeSelect" className="text-sm font-medium block mb-1">
              Normalization Mode
            </label>
            <Dropdown
              id="replayGainModeSelect"
              name="replayGainMode"
              value={replayGainMode}
              options={replayGainModeOptions}
              onChange={(e) => {
                const mode = e.currentTarget.value as 'track' | 'album' | 'off';
                setReplayGainMode(mode);
                updateReplayGain({ mode });
              }}
            />
          </div>

          <div className="mb-4">
            <Checkbox
              id="togglePreventClipping"
              isChecked={preventClipping}
              checkedStateUpdateFunction={(state) => {
                setPreventClipping(state);
                updateReplayGain({ preventClipping: state });
              }}
              labelContent="Prevent clipping (limits gain to ensure peak never clips)"
            />
          </div>

          <div className="preamp-container flex flex-col w-1/2 min-w-[200px]">
            <span className="text-sm font-medium mb-1">
              Pre-amp Adjustment: {preampDb > 0 ? `+${preampDb}` : preampDb} dB
            </span>
            <div className="flex items-center">
              <span className="text-xs mr-2">-12 dB</span>
              <input
                type="range"
                min={-12}
                max={12}
                step={0.5}
                value={preampDb}
                onChange={(e) => {
                  const val = e.currentTarget.valueAsNumber;
                  setPreampDb(val);
                  updateReplayGain({ preampDb: val });
                }}
                className="w-full h-1 bg-neutral-300 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-xs ml-2">+12 dB</span>
              <Button
                label="Reset"
                iconName="restart_alt"
                className="ml-4"
                isDisabled={preampDb === 0}
                clickHandler={() => {
                  setPreampDb(0);
                  updateReplayGain({ preampDb: 0 });
                }}
              />
            </div>
          </div>
        </li>
      </ul>
    </li>
  );
};

export default AudioPlaybackSettings;
