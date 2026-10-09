import type {
  AttentionCliffBucket,
  AudiophileListeningMetrics,
  ChronotypeData,
  DailyActivityItem,
  HistoryPeriod,
  HourlyDistributionItem,
  LibraryAudioStatsData,
  ListeningAnalyticsData,
  ListeningAnalyticsSummary,
  LoopAddictionItem,
  SkipForensicsData,
  TopArtistItem,
  TopGenreItem,
  TopTrackItem
} from '@common/analytics';
import { createQueryKeys } from '@lukemorales/query-key-factory';

export type {
  AttentionCliffBucket,
  AudiophileListeningMetrics,
  ChronotypeData,
  DailyActivityItem,
  HistoryPeriod,
  HourlyDistributionItem,
  LibraryAudioStatsData,
  ListeningAnalyticsData,
  ListeningAnalyticsSummary,
  LoopAddictionItem,
  SkipForensicsData,
  TopArtistItem,
  TopGenreItem,
  TopTrackItem
};

export const analyticsQuery = createQueryKeys('analytics', {
  listening: (period: HistoryPeriod = '30') => ({
    queryKey: [period],
    queryFn: async (): Promise<ListeningAnalyticsData> => {
      return window.api.audioLibraryControls.getListeningAnalytics(period);
    }
  }),
  libraryStats: {
    queryKey: null,
    queryFn: async (): Promise<LibraryAudioStatsData> => {
      return window.api.audioLibraryControls.getLibraryAudioStats();
    }
  }
});
