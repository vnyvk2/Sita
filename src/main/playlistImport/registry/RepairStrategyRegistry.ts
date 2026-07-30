import type { PlaylistRepairStrategy } from '../interfaces/PlaylistRepairStrategy';

export class RepairStrategyRegistry {
  private strategies: PlaylistRepairStrategy[] = [];

  register(strategy: PlaylistRepairStrategy): void {
    this.strategies.push(strategy);
  }

  getStrategies(): readonly PlaylistRepairStrategy[] {
    return this.strategies;
  }
}
