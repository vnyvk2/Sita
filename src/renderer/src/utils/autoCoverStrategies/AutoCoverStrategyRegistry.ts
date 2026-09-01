import type { AutoCoverStrategyId } from '../../types/playlistCover';
import type { AutoCoverStrategy } from './AutoCoverStrategy';
import { FirstNStrategy } from './FirstNStrategy';
import { MostPlayedStrategy } from './MostPlayedStrategy';
import { RandomStrategy } from './RandomStrategy';
import { RecentlyAddedStrategy } from './RecentlyAddedStrategy';

export const AUTO_COVER_STRATEGIES: readonly AutoCoverStrategy[] = [
  FirstNStrategy,
  MostPlayedStrategy,
  RecentlyAddedStrategy,
  RandomStrategy
] as const;

export const AUTO_COVER_STRATEGY_MAP: Record<AutoCoverStrategyId, AutoCoverStrategy> = {
  firstN: FirstNStrategy,
  mostPlayed: MostPlayedStrategy,
  recentlyAdded: RecentlyAddedStrategy,
  random: RandomStrategy
};

export function getAutoCoverStrategy(strategyId?: AutoCoverStrategyId): AutoCoverStrategy {
  if (strategyId && strategyId in AUTO_COVER_STRATEGY_MAP) {
    return AUTO_COVER_STRATEGY_MAP[strategyId];
  }
  return FirstNStrategy;
}

export function getAllAutoCoverStrategies(): readonly AutoCoverStrategy[] {
  return AUTO_COVER_STRATEGIES;
}
