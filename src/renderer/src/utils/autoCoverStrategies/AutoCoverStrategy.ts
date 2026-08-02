import type { AutoCoverStrategyId } from '../../types/playlistCover';
import type { AutoCoverContext } from './AutoCoverContext';

export interface AutoCoverStrategy {
  id: AutoCoverStrategyId;
  label: string;
  description: string;
  isDeterministic: boolean;
  resolveSongs(context: AutoCoverContext): (SongData | undefined)[];
}
