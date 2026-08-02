import type { AutoCoverContext } from './AutoCoverContext';
import type { AutoCoverStrategy } from './AutoCoverStrategy';

export const RandomStrategy: AutoCoverStrategy = {
  id: 'random',
  label: 'Random',
  description: 'Select random songs from playlist',
  resolveSongs(context: AutoCoverContext) {
    const { songs = [], targetSize } = context;
    if (songs.length <= targetSize) return songs;
    const copy = [...songs];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, targetSize);
  }
};
