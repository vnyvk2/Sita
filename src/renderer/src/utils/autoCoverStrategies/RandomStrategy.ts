import type { AutoCoverContext } from './AutoCoverContext';
import type { AutoCoverStrategy } from './AutoCoverStrategy';

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export const RandomStrategy: AutoCoverStrategy = {
  id: 'random',
  label: 'Random',
  description: 'Select pseudo-random songs deterministically based on playlist content',
  isDeterministic: true,
  resolveSongs(context: AutoCoverContext) {
    const { songs = [], targetSize } = context;
    if (songs.length <= targetSize) return songs;

    let seed = songs.reduce((acc, song) => acc + (song?.songId || 0), 1337);
    const copy = [...songs];

    for (let i = copy.length - 1; i > 0; i--) {
      const r = seededRandom(seed++);
      const j = Math.floor(r * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, targetSize);
  }
};
