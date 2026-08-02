import type { AutoCoverContext } from './AutoCoverContext';
import type { AutoCoverStrategy } from './AutoCoverStrategy';

export const FirstNStrategy: AutoCoverStrategy = {
  id: 'firstN',
  label: 'First Songs',
  description: 'Take the first N songs in playlist order',
  resolveSongs(context: AutoCoverContext) {
    const { songs = [], targetSize } = context;
    return songs.slice(0, Math.min(songs.length, targetSize));
  }
};
