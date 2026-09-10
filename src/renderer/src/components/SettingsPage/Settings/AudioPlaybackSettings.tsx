import { dispatch, store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { lazy, useContext, useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../../contexts/AppUpdateContext';
import i18n from '../../../i18n';
import storage from '../../../utils/localStorage';
import Button from '../../Button';
import Checkbox from '../../Checkbox';
import Dropdown, { type DropdownOption } from '../../Dropdown';

const AudioFxModal = lazy(() => import('../../SongsControlsContainer/AudioFxModal'));

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
  const audioFxPreset = useStore(
    store,
    (state) => state.localStorage?.playback?.audioFx?.preset ?? 'normal'
  );

  const { t } = useTranslation();
  const { changePromptMenuData } = useContext(AppUpdateContext);

  const [seekbarScrollInterval, setSeekbarScrollInterval] = useState('5');
  const [playbackRateInterval, setPlaybackRateInterval] = useState(1);

  const [replayGainMode, setReplayGainMode] = useState<'track' | 'album' | 'off'>('track');
  const [preampDb, setPreampDb] = useState(0);
  const [preventClipping, setPreventClipping] = useState(true);
  const [crossfadeDuration, setCrossfadeDuration] = useState(0);

  useEffect(() => {
    const interval = storage.preferences.getPreferences('seekbarScrollInterval');
    const playbackRate = storage.playback.getPlaybackOptions('playbackRate');
    const rg = storage.playback.getPlaybackOptions('replayGain');
    const cf = storage.playback.getPlaybackOptions('crossfade');

    setPlaybackRateInterval(playbackRate);
    setSeekbarScrollInterval(interval.toString());

    if (rg) {
      if (rg.mode) setReplayGainMode(rg.mode);
      if (typeof rg.preampDb === 'number') setPreampDb(rg.preampDb);
      if (typeof rg.preventClipping === 'boolean') setPreventClipping(rg.preventClipping);
    }

    if (cf && typeof cf.duration === 'number') {
      setCrossfadeDuration(cf.duration);
    }
  }, []);

  const updateCrossfade = (duration: number) => {
    setCrossfadeDuration(duration);
    storage.playback.setPlaybackOptions('crossfade', { duration });
    dispatch({ type: 'UPDATE_LOCAL_STORAGE', data: storage.getLocalStorage() });
  };

  const updateReplayGain = (
    updated: Partial<{
      mode: 'track' | 'album' | 'off';
      preampDb: number;
      preventClipping: boolean;
    }>
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
        <li className="secondary-container enable-waveform-seekbar mb-4">
          <div className="description">{t('settingsPage.enableWaveformSeekbarDescription')}</div>
          <Checkbox
            id="toggleEnableWaveformSeekbar"
            isChecked={preferences?.isWaveformSeekbarEnabled ?? true}
            checkedStateUpdateFunction={(state) => {
              storage.preferences.setPreferences('isWaveformSeekbarEnabled', state);
              dispatch({ type: 'TOGGLE_WAVEFORM_SEEKBAR', data: state });
            }}
            labelContent={t('settingsPage.enableWaveformSeekbar')}
          />
        </li>

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
                  className="seek-bar-slider thumb-visible before:bg-font-color-highlight hover:before:bg-font-color-highlight dark:before:bg-font-color-highlight dark:hover:before:bg-dark-font-color-highlight relative float-left mx-4 h-6 w-full appearance-none bg-transparent p-0 outline-hidden outline-offset-1 before:absolute before:top-1/2 before:left-0 before:h-1 before:w-(--seek-before-width) before:-translate-y-1/2 before:cursor-pointer before:rounded-3xl before:transition-[width,background] before:content-[''] focus-visible:outline! disabled:opacity-50 disabled:cursor-not-allowed"
                  min={0.25}
                  step={0.05}
                  max={4.0}
                  disabled={audioFxPreset !== 'normal'}
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
              isDisabled={playbackRateInterval === 1 || audioFxPreset !== 'normal'}
              clickHandler={() => {
                setPlaybackRateInterval(1);
                storage.playback.setPlaybackOptions('playbackRate', 1);
                dispatch({ type: 'UPDATE_PLAYBACK_RATE', data: 1 });
              }}
            />
          </div>
          {audioFxPreset !== 'normal' && (
            <p className="mt-2 text-xs text-font-color-highlight dark:text-dark-font-color-highlight">
              {t('audioFx.speedOverridden', 'Playback rate is currently overridden by active Audio FX preset.')}
            </p>
          )}
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
          <div className="title text-font-color-highlight dark:text-dark-font-color-highlight mb-1 text-lg font-medium">
            Loudness Normalization (ReplayGain / ITU-R BS.1770)
          </div>
          <div className="description mb-3 text-sm opacity-80">
            Automatically adjusts track and album playback volume to a consistent standard loudness
            (-18 LUFS).
          </div>

          <div className="mb-4">
            <label htmlFor="replayGainModeSelect" className="mb-1 block text-sm font-medium">
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

          <div className="preamp-container flex w-1/2 min-w-[200px] flex-col">
            <span className="mb-1 text-sm font-medium">
              Pre-amp Adjustment: {preampDb > 0 ? `+${preampDb}` : preampDb} dB
            </span>
            <div className="flex items-center">
              <span className="mr-2 text-xs">-12 dB</span>
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
                className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-neutral-300 dark:bg-neutral-700"
              />
              <span className="ml-2 text-xs">+12 dB</span>
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

        <li className="crossfade-settings mb-6" id="crossfadeSettings">
          <div className="title text-font-color-highlight dark:text-dark-font-color-highlight mb-1 text-lg font-medium">
            {t('crossfade.title', 'Crossfade Songs')}
          </div>
          <div className="description mb-3 text-sm opacity-80">
            {t(
              'crossfade.description',
              'Smoothly fade between consecutive tracks using equal-power volume curves.'
            )}
          </div>

          <div className="crossfade-container flex w-1/2 min-w-[200px] flex-col">
            <span className="mb-1 text-sm font-medium">
              {t('crossfade.duration', 'Crossfade Duration')}:{' '}
              <span className="text-font-color-highlight dark:text-dark-font-color-highlight font-semibold">
                {crossfadeDuration === 0 ? t('crossfade.off', 'Off') : `${crossfadeDuration} s`}
              </span>
            </span>
            <div className="flex items-center">
              <span className="mr-2 text-xs">Off</span>
              <input
                type="range"
                min={0}
                max={12}
                step={1}
                value={crossfadeDuration}
                onChange={(e) => {
                  const val = e.currentTarget.valueAsNumber;
                  updateCrossfade(val);
                }}
                className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-neutral-300 dark:bg-neutral-700"
              />
              <span className="ml-2 text-xs">12s</span>
              <Button
                label="Reset"
                iconName="restart_alt"
                className="ml-4"
                isDisabled={crossfadeDuration === 0}
                clickHandler={() => updateCrossfade(0)}
              />
            </div>
          </div>
        </li>

        <li className="audio-fx-settings mb-6" id="audioFxSettings">
          <div className="title text-font-color-highlight dark:text-dark-font-color-highlight mb-1 text-lg font-medium">
            {t('audioFx.title', 'Audio Effects')}
          </div>
          <div className="description mb-3 text-sm opacity-80">
            {t(
              'audioFx.description',
              'Transform your playback with live acoustic effects and speed modulation.'
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">
              Current Preset:{' '}
              <span className="text-font-color-highlight dark:text-dark-font-color-highlight font-semibold capitalize">
                {audioFxPreset}
              </span>
            </span>
            <Button
              label="Configure Audio Effects"
              iconName="graphic_eq"
              clickHandler={() => changePromptMenuData(true, <AudioFxModal />)}
            />
          </div>
        </li>
      </ul>
    </li>
  );
};

export default AudioPlaybackSettings;
