import type { AutoCoverContext } from './AutoCoverContext';
import type { AutoCoverStrategy } from './AutoCoverStrategy';

export const MostPlayedStrategy: AutoCoverStrategy = {
  id: 'mostPlayed',
  label: 'Most Played',
  description: 'Select top played songs in playlist',
  resolveSongs(context: AutoCoverContext) {
    const { songs = [], targetSize } = context;
    const sorted = [...songs].sort((a, b) => {
      const playsA = (a as any)?.plays || 0;
      const playsB = (b as any)?.plays || 0;
      return playsB - playsA;
    });
    return sorted.slice(0, Math.min(sorted.length, targetSize));
  }
};
