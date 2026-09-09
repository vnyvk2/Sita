import { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { AUDIO_FX_PRESETS, type AudioFxOptions, type AudioFxPresetType } from '../../other/audioFx/types';
import Button from '../Button';
import Checkbox from '../Checkbox';

const AudioFxModal = () => {
  const { t } = useTranslation();
  const player = useAudioPlayer();
  const { changePromptMenuData } = useContext(AppUpdateContext);

  const [currentFx, setCurrentFx] = useState<AudioFxOptions>(() => player.getAudioFx());

  useEffect(() => {
    const onFxChange = (updatedFx: unknown) => {
      setCurrentFx(updatedFx as AudioFxOptions);
    };

    player.on('audioFxChange', onFxChange);
    return () => player.off('audioFxChange', onFxChange);
  }, [player]);

  const selectPreset = (preset: AudioFxPresetType) => {
    player.setAudioFxPreset(preset);
  };

  const updateParam = <K extends keyof AudioFxOptions>(key: K, value: AudioFxOptions[K]) => {
    player.setAudioFxPreset('custom', { [key]: value });
  };

  const presets: { id: AudioFxPresetType; label: string; icon: string }[] = [
    { id: 'normal', label: t('audioFx.presets.normal', 'Normal'), icon: 'music_note' },
    { id: 'slowed', label: t('audioFx.presets.slowed', 'Slowed + Reverb'), icon: 'waves' },
    { id: 'nightcore', label: t('audioFx.presets.nightcore', 'Nightcore'), icon: 'bolt' },
    { id: 'custom', label: t('audioFx.presets.custom', 'Custom'), icon: 'tune' }
  ];

  return (
    <div className="audio-fx-prompt max-w-[34rem] min-w-[28rem] p-6">
      <div className="header mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-icons-round text-font-color-highlight dark:text-dark-font-color-highlight text-3xl">
            graphic_eq
          </span>
          <div>
            <h2 className="text-xl font-bold text-font-color-black dark:text-font-color-white">
              {t('audioFx.title', 'Audio Effects')}
            </h2>
            <p className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed">
              {t('audioFx.description', 'Transform playback with live reverb, pitch & speed modulation')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => changePromptMenuData(false)}
          className="material-icons-round text-font-color-dimmed hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:text-font-color-white cursor-pointer text-2xl transition-colors"
        >
          close
        </button>
      </div>

      {/* Preset Pills */}
      <div className="presets-container mb-6 grid grid-cols-4 gap-2">
        {presets.map((preset) => {
          const isActive = currentFx.preset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => selectPreset(preset.id)}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-xs font-semibold transition-all ${
                isActive
                  ? 'border-font-color-highlight bg-font-color-highlight/10 text-font-color-highlight dark:border-dark-font-color-highlight dark:bg-dark-font-color-highlight/15 dark:text-dark-font-color-highlight shadow-sm'
                  : 'border-background-color-2/80 bg-background-color-2/40 text-font-color-black hover:bg-background-color-2 dark:border-dark-background-color-2/80 dark:bg-dark-background-color-2/40 dark:text-font-color-white dark:hover:bg-dark-background-color-2'
              }`}
            >
              <span className="material-icons-round text-xl">{preset.icon}</span>
              <span>{preset.label}</span>
            </button>
          );
        })}
      </div>

      {/* Custom Fine-Tuning Sliders */}
      <div className="sliders-section bg-background-color-2/30 dark:bg-dark-background-color-2/30 mb-6 flex flex-col gap-4 rounded-xl border border-background-color-2/60 dark:border-dark-background-color-2/60 p-4">
        {/* Playback Speed */}
        <div className="slider-row">
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="font-medium text-font-color-black dark:text-font-color-white">
              {t('audioFx.speed', 'Playback Speed')}
            </span>
            <span className="font-mono text-font-color-highlight dark:text-dark-font-color-highlight">
              {currentFx.playbackRate.toFixed(2)}x
            </span>
          </div>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.01"
            value={currentFx.playbackRate}
            onChange={(e) => updateParam('playbackRate', parseFloat(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-background-color-2 accent-font-color-highlight dark:bg-dark-background-color-2 dark:accent-dark-font-color-highlight"
          />
        </div>

        {/* Pitch Lock Checkbox */}
        <div className="checkbox-row pt-1">
          <Checkbox
            id="audiofx-preserve-pitch"
            isChecked={currentFx.preservesPitch}
            checkedStateUpdateFunction={(isChecked) => updateParam('preservesPitch', isChecked)}
            labelContent={t('audioFx.preservePitch', 'Preserve original pitch (Time-stretch mode)')}
          />
        </div>

        {/* Reverb Wet Mix */}
        <div className="slider-row pt-1">
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="font-medium text-font-color-black dark:text-font-color-white">
              {t('audioFx.reverbWet', 'Reverb Mix')}
            </span>
            <span className="font-mono text-font-color-highlight dark:text-dark-font-color-highlight">
              {Math.round(currentFx.reverbWet * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={currentFx.reverbWet}
            onChange={(e) => updateParam('reverbWet', parseFloat(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-background-color-2 accent-font-color-highlight dark:bg-dark-background-color-2 dark:accent-dark-font-color-highlight"
          />
        </div>

        {/* Low-Pass Cutoff (Warm / Muffled Filter) */}
        <div className="slider-row pt-1">
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="font-medium text-font-color-black dark:text-font-color-white">
              {t('audioFx.lowPassCutoff', 'Tone Damping (Cutoff)')}
            </span>
            <span className="font-mono text-font-color-highlight dark:text-dark-font-color-highlight">
              {currentFx.lowPassCutoff >= 19500 ? 'Bypass' : `${Math.round(currentFx.lowPassCutoff)} Hz`}
            </span>
          </div>
          <input
            type="range"
            min="1000"
            max="20000"
            step="250"
            value={currentFx.lowPassCutoff}
            onChange={(e) => updateParam('lowPassCutoff', parseFloat(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-background-color-2 accent-font-color-highlight dark:bg-dark-background-color-2 dark:accent-dark-font-color-highlight"
          />
        </div>

        {/* Treble Peaking Boost */}
        <div className="slider-row pt-1">
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="font-medium text-font-color-black dark:text-font-color-white">
              {t('audioFx.trebleBoost', 'Treble Boost (Nightcore punch)')}
            </span>
            <span className="font-mono text-font-color-highlight dark:text-dark-font-color-highlight">
              {currentFx.trebleBoostGain > 0 ? `+${currentFx.trebleBoostGain.toFixed(1)} dB` : `${currentFx.trebleBoostGain.toFixed(1)} dB`}
            </span>
          </div>
          <input
            type="range"
            min="-6"
            max="6"
            step="0.5"
            value={currentFx.trebleBoostGain}
            onChange={(e) => updateParam('trebleBoostGain', parseFloat(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-background-color-2 accent-font-color-highlight dark:bg-dark-background-color-2 dark:accent-dark-font-color-highlight"
          />
        </div>
      </div>

      {/* Footer Controls */}
      <div className="footer flex justify-between items-center">
        <button
          type="button"
          onClick={() => selectPreset('normal')}
          className="text-xs text-font-color-dimmed hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:text-font-color-white transition-colors"
        >
          {t('audioFx.reset', 'Reset to Normal')}
        </button>

        <Button
          label={t('common.done', 'Done')}
          clickHandler={() => changePromptMenuData(false)}
          className="px-6!"
        />
      </div>
    </div>
  );
};

export default AudioFxModal;
