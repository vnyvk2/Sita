export type HistoryPeriod = '7' | '30' | '180' | '365' | 'all';

export interface ListeningAnalyticsSummary {
  totalListeningSeconds: number;
  totalPlaysCount: number;
  totalSkipsCount: number;
  completionRate: number; // 0..1
  uniqueSongsPlayed: number;
  uniqueArtistsPlayed: number;
}

export interface DailyActivityItem {
  date: string; // YYYY-MM-DD
  seconds: number;
  playCount: number;
}

export interface HourlyDistributionItem {
  hour: number; // 0..23
  playCount: number;
  percentage: number;
}

export interface TopArtistItem {
  artistId: number;
  name: string;
  artworkPaths?: {
    artworkPath?: string;
    artworkBuffer?: unknown;
    onlineArtworkPaths?: string[];
  };
  playCount: number;
  totalSeconds: number;
}

export interface TopGenreItem {
  genreId: number;
  name: string;
  playCount: number;
  percentage: number;
}

export interface TopTrackItem {
  songId: number;
  title: string;
  duration: number;
  artists: Array<{ artistId: number; name: string }>;
  album?: { albumId: number; title: string };
  artworkPaths?: {
    artworkPath?: string;
    artworkBuffer?: unknown;
    onlineArtworkPaths?: string[];
  };
  playCount: number;
  totalSeconds: number;
}

export interface AttentionCliffBucket {
  label: string;
  count: number;
  percentage: number;
}

export interface SkipForensicsData {
  totalSkips: number;
  patienceScore: number;
  archetype: string;
  attentionCliff: AttentionCliffBucket[];
  coldShoulder?: {
    songId: number;
    title: string;
    positionSecs: number;
  };
  theTragedy?: {
    songId: number;
    title: string;
    completionPercentage: number;
  };
}

export interface AudiophileListeningMetrics {
  rawPcmGigabytes: number;
  losslessPercentage: number;
  peakSampleRate: number;
  resolutionTier: 'Master Class' | 'Hi-Fi Grade' | 'Standard Lossless' | 'Compressed';
  dominantResolution: string;
  spectrum: {
    hiResPercent: number;
    cdQualityPercent: number;
    mp3HighPercent: number;
    lossyOtherPercent: number;
  };
}

export interface LoopAddictionItem {
  hasAddiction: boolean;
  streakCount: number;
  songId?: number;
  title?: string;
  artistName?: string;
  totalLoopMinutes?: number;
  lastPlayedAt?: string;
}

export interface ChronotypeData {
  name: string;
  icon: string;
  peakHour: number;
  peakSegment: 'night' | 'morning' | 'afternoon' | 'evening';
  segmentPercentages: {
    night: number;
    morning: number;
    afternoon: number;
    evening: number;
  };
}

export interface ListeningAnalyticsData {
  period: HistoryPeriod;
  summary: ListeningAnalyticsSummary;
  dailyActivity: DailyActivityItem[];
  hourlyDistribution: HourlyDistributionItem[];
  topArtists: TopArtistItem[];
  topGenres: TopGenreItem[];
  topTracks: TopTrackItem[];
  skipForensics?: SkipForensicsData;
  audiophileMetrics?: AudiophileListeningMetrics;
  loopAddiction?: LoopAddictionItem;
  chronotype?: ChronotypeData;
}

export interface LibraryAudioStatsData {
  totalTracks: number;
  totalDurationSeconds: number;
  averageBitrate: number;
  losslessCount: number;
  lossyCount: number;
  hiResCount: number;
  codecBreakdown: Array<{ codec: string; count: number; percentage: number }>;
  sampleRateBreakdown: Array<{ sampleRate: number; count: number }>;
}
