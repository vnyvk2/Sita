import { createQueryKeys } from '@lukemorales/query-key-factory';

import type {
  HistoryPeriod,
  ListeningAnalyticsData,
  LibraryAudioStatsData
} from '../../../main/db/queries/analytics';

export type { HistoryPeriod, ListeningAnalyticsData, LibraryAudioStatsData };

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
