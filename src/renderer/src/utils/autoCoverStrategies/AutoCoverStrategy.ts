import type { AutoCoverStrategyId } from '../../types/playlistCover';
import type { AutoCoverContext } from './AutoCoverContext';

export interface AutoCoverStrategy {
  id: AutoCoverStrategyId;
  label: string;
  description: string;
  resolveSongs(context: AutoCoverContext): (SongData | undefined)[];
}
