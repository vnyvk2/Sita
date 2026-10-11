export interface HistorySongIdsParams {
  sortType?: SongSortTypes;
  period?: HistoryPeriod;
  limit?: number;
  language?: string;
}

export interface HistorySongIdsResult {
  entries: Array<{
    songId: number;
    playedAt?: number;
    playCount?: number;
  }>;
  ids: number[];
  total: number;
  totalDuration?: number;
  blacklistedIds: number[];
  languages: string[];
}
