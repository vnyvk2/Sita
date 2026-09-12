import { createQueryKeys } from '@lukemorales/query-key-factory';

import type {
  DailyActivityItem,
  HistoryPeriod,
  HourlyDistributionItem,
  LibraryAudioStatsData,
  ListeningAnalyticsData,
  ListeningAnalyticsSummary,
  TopArtistItem,
  TopGenreItem,
  TopTrackItem
} from '@common/analytics';

export type {
  DailyActivityItem,
  HistoryPeriod,
  HourlyDistributionItem,
  LibraryAudioStatsData,
  ListeningAnalyticsData,
  ListeningAnalyticsSummary,
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
