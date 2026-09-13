import { useStore } from '@tanstack/react-store';
import { type CSSProperties, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { dispatch, store } from '../store/store';

type Props = {
  id?: string;
  name?: string;
  className?: string;
  sliderOpacity?: number;
};

const KaraokeSlider = (props: Props) => {
  const { t } = useTranslation();
  const karaokeLevel = useStore(
    store,
    (state) => state.localStorage?.playback?.karaokeLevel ?? 100
  );
  const isKaraoke = useStore(store, (state) => state.localStorage?.playback?.isKaraoke ?? false);

  const { id = 'karaokeSlider', name = 'player-karaoke-slider', className, sliderOpacity } = props;
  const sliderRef = useRef<HTMLInputElement>(null);

  const displayLevel = isKaraoke ? karaokeLevel : 0;
  const sliderCssProperties: CSSProperties = {
    '--volume-before-width': `${displayLevel}%`
  } as CSSProperties;
  if (sliderOpacity !== undefined) {
    (sliderCssProperties as Record<string, unknown>)['--slider-opacity'] = `${sliderOpacity}`;
  }

  const changeLevel = (value: number) => {
    dispatch({ type: 'UPDATE_KARAOKE_LEVEL', data: value });
  };

  return (
    <input
      type="range"
      id={id}
      name={name}
      className={`before:bg-seekbar-background-color hover:before:bg-font-color-highlight dark:before:bg-dark-seekbar-background-color/75 dark:hover:before:bg-dark-font-color-highlight relative float-left m-0 h-6 appearance-none bg-transparent p-0 outline-hidden outline-offset-1 before:absolute before:top-1/2 before:left-0 before:h-1 before:w-(--volume-before-width) before:-translate-y-1/2 before:cursor-pointer before:rounded-3xl before:transition-[width,background] before:content-[''] focus-visible:outline! ${className ?? 'w-full'}`}
      min={0}
      max={100}
      step={5}
      value={displayLevel}
      onChange={(e) => changeLevel(Number(e.target.value))}
      aria-label={t('player.karaokeLevel', 'Vocal Reduction Level')}
      style={sliderCssProperties}
      title={`${t('player.karaokeLevel', 'Vocal Reduction')}: ${Math.round(displayLevel)}%`}
      onWheel={(e) => {
        const increment = e.deltaY > 0 ? -5 : 5;
        let value = karaokeLevel + increment;
        if (value > 100) value = 100;
        if (value < 0) value = 0;
        changeLevel(value);
      }}
      ref={sliderRef}
    />
  );
};

export default KaraokeSlider;
