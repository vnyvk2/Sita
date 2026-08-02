import type { AutoCoverContext } from './AutoCoverContext';
import type { AutoCoverStrategy } from './AutoCoverStrategy';

export const RecentlyAddedStrategy: AutoCoverStrategy = {
  id: 'recentlyAdded',
  label: 'Recent',
  description: 'Select most recently added songs',
  resolveSongs(context: AutoCoverContext) {
    const { songs = [], targetSize } = context;
    const sorted = [...songs].sort((a, b) => {
      const dateA = new Date((a as any)?.addedDate || (a as any)?.createdDate || 0).getTime();
      const dateB = new Date((b as any)?.addedDate || (b as any)?.createdDate || 0).getTime();
      return dateB - dateA;
    });
    return sorted.slice(0, Math.min(sorted.length, targetSize));
  }
};
