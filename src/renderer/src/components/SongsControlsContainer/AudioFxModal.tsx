import { type CSSProperties, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@tanstack/react-store';

import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { type AudioFxOptions, type AudioFxPresetType } from '../../other/audioFx/types';
import type AudioPlayer from '../../other/player';
import { dispatch, store } from '../../store/store';
import Button from '../Button';
import Checkbox from '../Checkbox';

const NIGHT_MODE_METER_SCALE_DB = 24; // 0 … 24 dB meter range

function NightModeReductionMeter({ player }: { player: AudioPlayer }) {
  const { t } = useTranslation();
  const fillRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      // DynamicsCompressorNode.reduction is negative or 0 dB (e.g. -6.4 dB)
      const db = Math.abs(player.getNightModeReduction());
      const pct = Math.min(100, Math.max(0, (db / NIGHT_MODE_METER_SCALE_DB) * 100));
      if (fillRef.current) {
        fillRef.current.style.width = `${pct}%`;
      }
      if (readoutRef.current) {
        readoutRef.current.textContent = db >= 0.1 ? `-${db.toFixed(1)} dB` : '0.0 dB';
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [player]);

  return (
    <div className="flex items-center gap-2 pt-0.5">
      <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[10px] font-medium shrink-0">
        {t('audioFx.nightModeReduction', 'Gain Reduction')}:
      </span>
      <div className="bg-background-color-2/80 dark:bg-dark-background-color-2/80 relative h-2 flex-1 overflow-hidden rounded-full">
        <div
          ref={fillRef}
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500 transition-[width] duration-75 ease-out"
          style={{ width: '0%' }}
        />
      </div>
      <span
        ref={readoutRef}
        className="text-font-color-dimmed dark:text-dark-font-color-dimmed w-14 font-mono text-[10px] text-right"
      >
        0.0 dB
      </span>
    </div>
  );
}

const AudioFxModal = () => {
  const { t } = useTranslation();
  const player = useAudioPlayer();
  const { changePromptMenuData } = useContext(AppUpdateContext);

  const [currentFx, setCurrentFx] = useState<AudioFxOptions>(() => player.getAudioFx());
  const isKaraoke = useStore(
    store,
    (state) => state.localStorage?.playback?.isKaraoke ?? false
  );
  const karaokeLevel = useStore(
    store,
    (state) => state.localStorage?.playback?.karaokeLevel ?? 100
  );
  const isNightMode = useStore(
    store,
    (state) => state.localStorage?.playback?.isNightMode ?? false
  );
  const nightModePreset = useStore(
    store,
    (state) => state.localStorage?.playback?.nightModePreset ?? 'standard'
  );

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

  const presets: { id: AudioFxPresetType; label: string; tag: string; icon: string }[] = [
    {
      id: 'normal',
      label: t('audioFx.presets.normal', 'Normal'),
      tag: '1.00x • Natural',
      icon: 'music_note'
    },
    {
      id: 'slowed',
      label: t('audioFx.presets.slowed', 'Slowed + Reverb'),
      tag: '0.85x • Deep Reverb',
      icon: 'waves'
    },
    {
      id: 'nightcore',
      label: t('audioFx.presets.nightcore', 'Nightcore'),
      tag: '1.28x • High Treble',
      icon: 'bolt'
    },
    {
      id: 'custom',
      label: t('audioFx.presets.custom', 'Custom'),
      tag: 'Manual Tuning',
      icon: 'tune'
    }
  ];

  const speedWidth = Math.max(0, Math.min(100, ((currentFx.playbackRate - 0.5) / 1.5) * 100));
  const reverbWetWidth = Math.max(0, Math.min(100, currentFx.reverbWet * 100));
  const reverbDecayWidth = Math.max(0, Math.min(100, ((currentFx.reverbDecay - 0.5) / 4.5) * 100));
  const cutoffWidth = Math.max(0, Math.min(100, ((currentFx.lowPassCutoff - 1000) / 19000) * 100));
  const trebleWidth = Math.max(0, Math.min(100, ((currentFx.trebleBoostGain + 6) / 12) * 100));

  const sliderClasses =
    "seek-bar-slider thumb-visible before:bg-font-color-highlight hover:before:bg-font-color-highlight dark:before:bg-font-color-highlight dark:hover:before:bg-dark-font-color-highlight relative block h-6 w-full appearance-none bg-transparent p-0 outline-hidden outline-offset-1 before:absolute before:top-1/2 before:left-0 before:h-1 before:w-(--seek-before-width) before:-translate-y-1/2 before:cursor-pointer before:rounded-3xl before:transition-[width,background] before:content-[''] focus-visible:outline!";

  return (
    <div className="audio-fx-prompt flex w-full flex-col gap-4 py-1">
      {/* Header (No duplicate close button; dialog already has one) */}
      <div className="header flex items-center gap-3">
        <div className="bg-font-color-highlight/10 text-font-color-highlight dark:bg-dark-font-color-highlight/15 dark:text-dark-font-color-highlight flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
          <span className="material-icons-round text-2xl">graphic_eq</span>
        </div>
        <div>
          <h2 className="text-font-color-black dark:text-font-color-white text-lg font-bold">
            {t('audioFx.title', 'Audio Effects & Studio DSP')}
          </h2>
          <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs">
            {t(
              'audioFx.description',
              'Transform playback with live acoustic reverb, pitch & speed modulation'
            )}
          </p>
        </div>
      </div>

      {/* Preset Cards - 4 in a row */}
      <div className="presets-container grid grid-cols-4 gap-2.5">
        {presets.map((preset) => {
          const isActive = currentFx.preset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => selectPreset(preset.id)}
              className={`group relative flex cursor-pointer flex-col items-start justify-between rounded-xl border p-3 text-left transition-all ${
                isActive
                  ? 'border-font-color-highlight bg-font-color-highlight/10 text-font-color-highlight ring-font-color-highlight/30 dark:border-dark-font-color-highlight dark:bg-dark-font-color-highlight/15 dark:text-dark-font-color-highlight dark:ring-dark-font-color-highlight/30 shadow-xs ring-1'
                  : 'border-background-color-2/80 bg-background-color-2/40 text-font-color-black hover:bg-background-color-2 dark:border-dark-background-color-2/80 dark:bg-dark-background-color-2/40 dark:text-font-color-white dark:hover:bg-dark-background-color-2/70'
              }`}
            >
              <div className="mb-1.5 flex w-full items-center justify-between">
                <span className="material-icons-round text-xl">{preset.icon}</span>
                {isActive && (
                  <span className="material-icons-round text-font-color-highlight dark:text-dark-font-color-highlight text-sm">
                    check_circle
                  </span>
                )}
              </div>
              <div className="text-xs leading-tight font-semibold">{preset.label}</div>
              <div className="mt-0.5 font-mono text-[10px] opacity-75">{preset.tag}</div>
            </button>
          );
        })}
      </div>

      {/* 2-Column Studio Rack Layout */}
      <div className="grid grid-cols-2 items-stretch gap-4">
        {/* Column 1: Speed & Pitch Modulation */}
        <div className="border-background-color-2/70 bg-background-color-2/30 dark:border-dark-background-color-2/70 dark:bg-dark-background-color-2/30 flex flex-col gap-4 rounded-xl border p-4">
          <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed flex items-center gap-2 text-xs font-bold tracking-wider uppercase">
            <span className="material-icons-round text-font-color-highlight dark:text-dark-font-color-highlight text-sm">
              speed
            </span>
            {t('audioFx.speedSection', 'Speed & Pitch Modulation')}
          </div>

          {/* Playback Speed Slider */}
          <div className="slider-row flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-font-color-black dark:text-font-color-white font-medium">
                {t('audioFx.speed', 'Playback Speed')}
              </span>
              <span className="bg-font-color-highlight/10 text-font-color-highlight dark:bg-dark-font-color-highlight/20 dark:text-dark-font-color-highlight rounded-md px-2 py-0.5 font-mono text-xs font-semibold">
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
              className={sliderClasses}
              style={{ '--seek-before-width': `${speedWidth}%` } as CSSProperties}
              title={`${currentFx.playbackRate.toFixed(2)}x`}
            />
            <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed flex w-full justify-between text-[11px] opacity-80">
              <span>0.50x</span>
              <span>2.00x</span>
            </div>
          </div>

          {/* Quick Speed Chips */}
          <div>
            <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed mb-1.5 text-[11px] font-medium">
              Quick Speed Presets
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[0.75, 0.85, 1.0, 1.15, 1.25, 1.28, 1.5].map((rate) => {
                const isSelected = Math.abs(currentFx.playbackRate - rate) < 0.005;
                return (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => updateParam('playbackRate', rate)}
                    className={`cursor-pointer rounded-md px-2 py-1 font-mono text-[11px] font-semibold transition-all ${
                      isSelected
                        ? 'bg-font-color-highlight text-font-color-white dark:bg-dark-font-color-highlight dark:text-font-color-black shadow-2xs'
                        : 'bg-background-color-2/60 text-font-color-black hover:bg-background-color-2 dark:bg-dark-background-color-2/60 dark:text-font-color-white dark:hover:bg-dark-background-color-2'
                    }`}
                  >
                    {rate.toFixed(2)}x
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pitch Lock Option */}
          <div className="border-background-color-2/60 bg-background-color-2/20 dark:border-dark-background-color-2/60 dark:bg-dark-background-color-2/20 rounded-lg border p-2.5">
            <Checkbox
              id="audiofx-preserve-pitch"
              isChecked={currentFx.preservesPitch}
              checkedStateUpdateFunction={(isChecked) => updateParam('preservesPitch', isChecked)}
              labelContent={t(
                'audioFx.preservePitch',
                'Preserve original pitch (Time-stretch mode)'
              )}
            />
            <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed mt-1 pl-7 text-[10px]">
              When checked, vocals maintain their original pitch when speed is changed. Uncheck for
              classic vinyl/tape pitch shifts (authentic nightcore & slowed).
            </p>
          </div>

          {/* Night Listening Mode (Dynamic Normalizer) */}
          <div className="border-background-color-2/60 bg-background-color-2/20 dark:border-dark-background-color-2/60 dark:bg-dark-background-color-2/20 mt-auto rounded-lg border p-2.5">
            <Checkbox
              id="audiofx-night-mode"
              isChecked={isNightMode}
              checkedStateUpdateFunction={() => dispatch({ type: 'TOGGLE_NIGHT_MODE' })}
              labelContent={t('audioFx.nightModeTitle', 'Night Listening Mode (Dynamic Normalizer)')}
            />
            <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed mt-1 pl-7 text-[10px]">
              {t(
                'audioFx.nightModeDescription',
                'Evens out dynamic range between quiet intros/dialogue and loud drops for comfortable late-night listening.'
              )}
            </p>

            {isNightMode && (
              <div className="mt-2.5 flex flex-col gap-2 pl-7">
                {/* Preset Pills */}
                <div className="flex items-center gap-1.5">
                  {(['gentle', 'standard', 'strong'] as const).map((preset) => {
                    const isActive = nightModePreset === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => dispatch({ type: 'SET_NIGHT_MODE_PRESET', data: preset })}
                        className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition-all ${
                          isActive
                            ? 'bg-font-color-highlight text-font-color-white dark:bg-dark-font-color-highlight dark:text-font-color-black shadow-2xs'
                            : 'border-background-color-2/80 bg-background-color-2/40 text-font-color-black hover:bg-background-color-2 dark:border-dark-background-color-2/80 dark:bg-dark-background-color-2/40 dark:text-font-color-white dark:hover:bg-dark-background-color-2/70 border'
                        }`}
                      >
                        {t(`audioFx.nightMode.${preset}`, preset)}
                      </button>
                    );
                  })}
                </div>

                {/* Live Gain Reduction Meter */}
                <NightModeReductionMeter player={player} />
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Acoustic Space & Equalization */}
        <div className="border-background-color-2/70 bg-background-color-2/30 dark:border-dark-background-color-2/70 dark:bg-dark-background-color-2/30 flex flex-col gap-3.5 rounded-xl border p-4">
          <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed flex items-center gap-2 text-xs font-bold tracking-wider uppercase">
            <span className="material-icons-round text-font-color-highlight dark:text-dark-font-color-highlight text-sm">
              surround_sound
            </span>
            {t('audioFx.acousticsSection', 'Acoustics & Equalization')}
          </div>

          {/* Reverb Mix */}
          <div className="slider-row flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-font-color-black dark:text-font-color-white font-medium">
                {t('audioFx.reverbWet', 'Reverb Mix')}
              </span>
              <span className="bg-font-color-highlight/10 text-font-color-highlight dark:bg-dark-font-color-highlight/20 dark:text-dark-font-color-highlight rounded-md px-2 py-0.5 font-mono text-xs font-semibold">
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
              className={sliderClasses}
              style={{ '--seek-before-width': `${reverbWetWidth}%` } as CSSProperties}
              title={`${Math.round(currentFx.reverbWet * 100)}%`}
            />
            <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed flex w-full justify-between text-[11px] opacity-80">
              <span>0% (Dry)</span>
              <span>100% (Wet)</span>
            </div>
          </div>

          {/* Reverb Decay */}
          <div className="slider-row flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-font-color-black dark:text-font-color-white font-medium">
                {t('audioFx.reverbDecay', 'Reverb Decay')}
              </span>
              <span className="bg-font-color-highlight/10 text-font-color-highlight dark:bg-dark-font-color-highlight/20 dark:text-dark-font-color-highlight rounded-md px-2 py-0.5 font-mono text-xs font-semibold">
                {currentFx.reverbDecay.toFixed(1)}s
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="5.0"
              step="0.1"
              value={currentFx.reverbDecay}
              onChange={(e) => updateParam('reverbDecay', parseFloat(e.target.value))}
              className={sliderClasses}
              style={{ '--seek-before-width': `${reverbDecayWidth}%` } as CSSProperties}
              title={`${currentFx.reverbDecay.toFixed(1)}s`}
            />
            <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed flex w-full justify-between text-[11px] opacity-80">
              <span>0.5s</span>
              <span>5.0s</span>
            </div>
          </div>

          {/* Tone Damping Cutoff */}
          <div className="slider-row flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-font-color-black dark:text-font-color-white font-medium">
                {t('audioFx.lowPassCutoff', 'Tone Damping (Cutoff)')}
              </span>
              <span className="bg-font-color-highlight/10 text-font-color-highlight dark:bg-dark-font-color-highlight/20 dark:text-dark-font-color-highlight rounded-md px-2 py-0.5 font-mono text-xs font-semibold">
                {currentFx.lowPassCutoff >= 19500
                  ? 'Bypass'
                  : `${(currentFx.lowPassCutoff / 1000).toFixed(1)} kHz`}
              </span>
            </div>
            <input
              type="range"
              min="1000"
              max="20000"
              step="250"
              value={currentFx.lowPassCutoff}
              onChange={(e) => updateParam('lowPassCutoff', parseFloat(e.target.value))}
              className={sliderClasses}
              style={{ '--seek-before-width': `${cutoffWidth}%` } as CSSProperties}
              title={
                currentFx.lowPassCutoff >= 19500
                  ? 'Bypass'
                  : `${Math.round(currentFx.lowPassCutoff)} Hz`
              }
            />
            <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed flex w-full justify-between text-[11px] opacity-80">
              <span>1.0 kHz</span>
              <span>Bypass</span>
            </div>
          </div>

          {/* Treble Peaking Boost */}
          <div className="slider-row flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-font-color-black dark:text-font-color-white font-medium">
                {t('audioFx.trebleBoost', 'Treble Boost (Presence)')}
              </span>
              <span className="bg-font-color-highlight/10 text-font-color-highlight dark:bg-dark-font-color-highlight/20 dark:text-dark-font-color-highlight rounded-md px-2 py-0.5 font-mono text-xs font-semibold">
                {currentFx.trebleBoostGain > 0
                  ? `+${currentFx.trebleBoostGain.toFixed(1)} dB`
                  : `${currentFx.trebleBoostGain.toFixed(1)} dB`}
              </span>
            </div>
            <input
              type="range"
              min="-6"
              max="6"
              step="0.5"
              value={currentFx.trebleBoostGain}
              onChange={(e) => updateParam('trebleBoostGain', parseFloat(e.target.value))}
              className={sliderClasses}
              style={{ '--seek-before-width': `${trebleWidth}%` } as CSSProperties}
              title={`${currentFx.trebleBoostGain.toFixed(1)} dB`}
            />
            <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed flex w-full justify-between text-[11px] opacity-80">
              <span>-6.0 dB</span>
              <span>+6.0 dB</span>
            </div>
          </div>

          {/* Karaoke / Vocal Reducer Option */}
          <div className="border-background-color-2/60 bg-background-color-2/20 dark:border-dark-background-color-2/60 dark:bg-dark-background-color-2/20 mt-auto rounded-lg border p-2.5">
            <Checkbox
              id="audiofx-karaoke-mode"
              isChecked={isKaraoke}
              checkedStateUpdateFunction={() => dispatch({ type: 'TOGGLE_KARAOKE_MODE' })}
              labelContent={t('audioFx.karaokeTitle', 'Karaoke Mode (Vocal Reducer)')}
            />
            <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed mt-1 pl-7 text-[10px]">
              {t(
                'audioFx.karaokeDescription',
                'Suppresses center-panned lead vocals in real-time while preserving instruments, bass, and stereo imaging.'
              )}
            </p>
            {isKaraoke && (
              <div className="mt-2.5 flex flex-col gap-1 pl-7">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-font-color-black dark:text-font-color-white font-medium">
                    {t('player.karaokeLevel', 'Vocal Reduction')}
                  </span>
                  <span className="bg-font-color-highlight/10 text-font-color-highlight dark:bg-dark-font-color-highlight/20 dark:text-dark-font-color-highlight rounded-md px-2 py-0.5 font-mono text-xs font-semibold">
                    {karaokeLevel}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={karaokeLevel}
                  onChange={(e) =>
                    dispatch({
                      type: 'UPDATE_KARAOKE_LEVEL',
                      data: parseInt(e.target.value, 10)
                    })
                  }
                  className={sliderClasses}
                  style={{ '--seek-before-width': `${karaokeLevel}%` } as CSSProperties}
                  title={`${karaokeLevel}%`}
                />
                <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed flex w-full justify-between text-[10px] opacity-80">
                  <span>0% (Original)</span>
                  <span>100% (Full Cut)</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Controls */}
      <div className="footer flex items-center justify-between pt-1">
        <Button
          label={t('audioFx.reset', 'Reset to Normal')}
          iconName="restart_alt"
          clickHandler={() => selectPreset('normal')}
          isDisabled={currentFx.preset === 'normal'}
        />

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
