export type AudioFxPresetType = 'normal' | 'slowed' | 'nightcore' | 'custom';

export interface AudioFxOptions {
  preset: AudioFxPresetType;
  playbackRate: number;
  preservesPitch: boolean;
  reverbWet: number; // 0.0 to 1.0
  reverbDecay: number; // seconds, e.g. 0.5 to 6.0
  lowPassCutoff: number; // Hz, e.g. 1000 to 20000 (20000 = bypass)
  trebleBoostGain: number; // dB, e.g. -6 to +6 (0 = bypass)
}

export const AUDIO_FX_PRESETS: Record<Exclude<AudioFxPresetType, 'custom'>, AudioFxOptions> = {
  normal: {
    preset: 'normal',
    playbackRate: 1.0,
    preservesPitch: true,
    reverbWet: 0.0,
    reverbDecay: 2.5,
    lowPassCutoff: 20000,
    trebleBoostGain: 0.0
  },
  slowed: {
    preset: 'slowed',
    playbackRate: 0.85,
    preservesPitch: false, // Authentic pitch-down
    reverbWet: 0.35,
    reverbDecay: 2.8,
    lowPassCutoff: 6500,
    trebleBoostGain: 0.0
  },
  nightcore: {
    preset: 'nightcore',
    playbackRate: 1.28,
    preservesPitch: false, // Authentic pitch-up
    reverbWet: 0.0,
    reverbDecay: 2.0,
    lowPassCutoff: 20000,
    trebleBoostGain: 2.5
  }
};
