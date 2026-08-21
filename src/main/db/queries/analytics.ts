import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { db, type DB, type DBTransaction } from '../db';
import {
  albums,
  albumsSongs,
  artists,
  artistsArtworks,
  artistsSongs,
  artworks,
  artworksSongs,
  genres,
  genresSongs,
  playEvents,
  playHistory,
  skipEvents,
  songs
} from '../schema';
import { parseArtistArtworks, parseSongArtworks } from '../../fs/resolveFilePaths';
import logger from '../../logger';

export type HistoryPeriod = '7' | '30' | '180' | '365' | 'all';

export const getCutoffDate = (period?: HistoryPeriod): Date | undefined => {
  if (!period || period === 'all') return undefined;
  const days = parseInt(period, 10);
  if (isNaN(days) || days <= 0) return undefined;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
};

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
    artworkBuffer?: Buffer;
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
    artworkBuffer?: Buffer;
    onlineArtworkPaths?: string[];
  };
  playCount: number;
  totalSeconds: number;
}

export interface ListeningAnalyticsData {
  period: HistoryPeriod;
  summary: ListeningAnalyticsSummary;
  dailyActivity: DailyActivityItem[];
  hourlyDistribution: HourlyDistributionItem[];
  topArtists: TopArtistItem[];
  topGenres: TopGenreItem[];
  topTracks: TopTrackItem[];
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

/**
 * Aggregates listening analytics for a given time period using PGLite SQL queries.
 */
export const getListeningAnalytics = async (
  period: HistoryPeriod = '30',
  trx: DB | DBTransaction = db
): Promise<ListeningAnalyticsData> => {
  const cutoff = getCutoffDate(period);
  const playHistoryWhere = cutoff ? gte(playHistory.createdAt, cutoff) : undefined;
  const playEventsWhere = cutoff ? gte(playEvents.createdAt, cutoff) : undefined;
  const skipEventsWhere = cutoff ? gte(skipEvents.createdAt, cutoff) : undefined;

  try {
    // 1. Play History & Play Events Aggregates
    const [historyAgg] = await trx
      .select({
        totalPlays: sql<number>`count(*)::int`,
        uniqueSongs: sql<number>`count(distinct ${playHistory.songId})::int`
      })
      .from(playHistory)
      .where(playHistoryWhere);

    const [eventsAgg] = await trx
      .select({
        totalListenedSeconds: sql<number>`coalesce(sum(${songs.duration} * (${playEvents.playbackPercentage}::float)), 0)::int`,
        fullListensCount: sql<number>`count(case when ${playEvents.playbackPercentage}::float >= 0.85 then 1 end)::int`,
        totalRecordedEvents: sql<number>`count(*)::int`
      })
      .from(playEvents)
      .innerJoin(songs, eq(playEvents.songId, songs.id))
      .where(playEventsWhere);

    const [skipsAgg] = await trx
      .select({
        totalSkips: sql<number>`count(*)::int`
      })
      .from(skipEvents)
      .where(skipEventsWhere);

    const totalPlaysCount = historyAgg?.totalPlays ?? 0;
    const uniqueSongsPlayed = historyAgg?.uniqueSongs ?? 0;
    const totalSkipsCount = skipsAgg?.totalSkips ?? 0;
    const totalListeningSeconds = eventsAgg?.totalListenedSeconds ?? 0;

    const fullListens = eventsAgg?.fullListensCount ?? 0;
    const totalPlayAttempts = (eventsAgg?.totalRecordedEvents ?? 0) + totalSkipsCount;
    const completionRate =
      totalPlayAttempts > 0 ? Math.min(1, Math.max(0, fullListens / totalPlayAttempts)) : totalPlaysCount > 0 ? 0.9 : 1.0;

    // Count unique artists in history
    const [uniqueArtistsAgg] = await trx
      .select({
        uniqueArtists: sql<number>`count(distinct ${artistsSongs.artistId})::int`
      })
      .from(playHistory)
      .innerJoin(artistsSongs, eq(playHistory.songId, artistsSongs.songId))
      .where(playHistoryWhere);

    const uniqueArtistsPlayed = uniqueArtistsAgg?.uniqueArtists ?? 0;

    // 2. Daily Activity (Date Bucketing)
    const dailyRecords = await trx
      .select({
        date: sql<string>`to_char(${playHistory.createdAt}, 'YYYY-MM-DD')`,
        playCount: sql<number>`count(*)::int`,
        seconds: sql<number>`coalesce(sum(${songs.duration}), 0)::int`
      })
      .from(playHistory)
      .innerJoin(songs, eq(playHistory.songId, songs.id))
      .where(playHistoryWhere)
      .groupBy(sql`to_char(${playHistory.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${playHistory.createdAt}, 'YYYY-MM-DD') ASC`);

    const dailyActivity: DailyActivityItem[] = dailyRecords.map((r) => ({
      date: r.date,
      playCount: r.playCount,
      seconds: r.seconds
    }));

    // 3. Hourly Circadian Distribution (0..23 hours)
    const hourlyRecords = await trx
      .select({
        hour: sql<number>`extract(hour from ${playHistory.createdAt})::int`,
        playCount: sql<number>`count(*)::int`
      })
      .from(playHistory)
      .where(playHistoryWhere)
      .groupBy(sql`extract(hour from ${playHistory.createdAt})`);

    const hourMap = new Map<number, number>();
    hourlyRecords.forEach((r) => hourMap.set(r.hour, r.playCount));

    const totalHourlyPlays = Array.from(hourMap.values()).reduce((sum, v) => sum + v, 0);
    const hourlyDistribution: HourlyDistributionItem[] = Array.from({ length: 24 }, (_, h) => {
      const playCount = hourMap.get(h) || 0;
      const percentage = totalHourlyPlays > 0 ? (playCount / totalHourlyPlays) * 100 : 0;
      return {
        hour: h,
        playCount,
        percentage: Math.round(percentage * 10) / 10
      };
    });

    // 4. Top Artists Rankings
    const artistHistoryRecords = await trx
      .select({
        artistId: artists.id,
        name: artists.name,
        playCount: sql<number>`count(*)::int`,
        totalSeconds: sql<number>`coalesce(sum(${songs.duration}), 0)::int`
      })
      .from(playHistory)
      .innerJoin(artistsSongs, eq(playHistory.songId, artistsSongs.songId))
      .innerJoin(artists, eq(artistsSongs.artistId, artists.id))
      .innerJoin(songs, eq(playHistory.songId, songs.id))
      .where(playHistoryWhere)
      .groupBy(artists.id, artists.name)
      .orderBy(sql`count(*) DESC`, sql`sum(${songs.duration}) DESC`)
      .limit(10);

    const topArtists: TopArtistItem[] = await Promise.all(
      artistHistoryRecords.map(async (a) => {
        // Fetch artwork for top artist
        const artistArtworksList = await trx
          .select({
            path: artworks.path,
            source: artworks.source
          })
          .from(artistsArtworks)
          .innerJoin(artworks, eq(artistsArtworks.artworkId, artworks.id))
          .where(eq(artistsArtworks.artistId, a.artistId))
          .limit(1);

        const artworkPaths = artistArtworksList[0]
          ? parseArtistArtworks(artistArtworksList.map((art) => art.path))
          : undefined;

        return {
          artistId: a.artistId,
          name: a.name,
          artworkPaths,
          playCount: a.playCount,
          totalSeconds: a.totalSeconds
        };
      })
    );

    // 5. Top Genres Rankings
    const genreHistoryRecords = await trx
      .select({
        genreId: genres.id,
        name: genres.name,
        playCount: sql<number>`count(*)::int`
      })
      .from(playHistory)
      .innerJoin(genresSongs, eq(playHistory.songId, genresSongs.songId))
      .innerJoin(genres, eq(genresSongs.genreId, genres.id))
      .where(playHistoryWhere)
      .groupBy(genres.id, genres.name)
      .orderBy(sql`count(*) DESC`)
      .limit(8);

    const totalGenrePlays = genreHistoryRecords.reduce((sum, g) => sum + g.playCount, 0);
    const topGenres: TopGenreItem[] = genreHistoryRecords.map((g) => ({
      genreId: g.genreId,
      name: g.name,
      playCount: g.playCount,
      percentage: totalGenrePlays > 0 ? Math.round((g.playCount / totalGenrePlays) * 1000) / 10 : 0
    }));

    // 6. Top Tracks Leaderboard
    const trackHistoryRecords = await trx
      .select({
        songId: songs.id,
        title: songs.title,
        duration: sql<number>`${songs.duration}::float`,
        playCount: sql<number>`count(*)::int`,
        totalSeconds: sql<number>`coalesce(sum(${songs.duration}), 0)::int`
      })
      .from(playHistory)
      .innerJoin(songs, eq(playHistory.songId, songs.id))
      .where(playHistoryWhere)
      .groupBy(songs.id, songs.title, songs.duration)
      .orderBy(sql`count(*) DESC`, sql`sum(${songs.duration}) DESC`)
      .limit(10);

    const topTracks: TopTrackItem[] = await Promise.all(
      trackHistoryRecords.map(async (t) => {
        // Fetch track artists
        const trackArtists = await trx
          .select({
            artistId: artists.id,
            name: artists.name
          })
          .from(artistsSongs)
          .innerJoin(artists, eq(artistsSongs.artistId, artists.id))
          .where(eq(artistsSongs.songId, t.songId));

        // Fetch album
        const trackAlbum = await trx
          .select({
            albumId: albums.id,
            title: albums.title
          })
          .from(albumsSongs)
          .innerJoin(albums, eq(albumsSongs.albumId, albums.id))
          .where(eq(albumsSongs.songId, t.songId))
          .limit(1);

        // Fetch artwork
        const trackArtworks = await trx
          .select({
            path: artworks.path
          })
          .from(artworksSongs)
          .innerJoin(artworks, eq(artworksSongs.artworkId, artworks.id))
          .where(eq(artworksSongs.songId, t.songId))
          .limit(1);

        const artworkPaths = trackArtworks[0]
          ? parseSongArtworks(trackArtworks.map((art) => ({ path: art.path } as any)))
          : undefined;

        return {
          songId: t.songId,
          title: t.title,
          duration: Number(t.duration),
          artists: trackArtists,
          album: trackAlbum[0] ? { albumId: trackAlbum[0].albumId, title: trackAlbum[0].title } : undefined,
          artworkPaths,
          playCount: t.playCount,
          totalSeconds: t.totalSeconds
        };
      })
    );

    return {
      period,
      summary: {
        totalListeningSeconds,
        totalPlaysCount,
        totalSkipsCount,
        completionRate: Math.round(completionRate * 1000) / 1000,
        uniqueSongsPlayed,
        uniqueArtistsPlayed
      },
      dailyActivity,
      hourlyDistribution,
      topArtists,
      topGenres,
      topTracks
    };
  } catch (error) {
    logger.error('[MAIN] getListeningAnalytics ERROR', { error, period });
    throw error;
  }
};

/**
 * Aggregates current audio library quality, formats, and codec statistics.
 */
export const getLibraryAudioStats = async (
  trx: DB | DBTransaction = db
): Promise<LibraryAudioStatsData> => {
  try {
    const librarySongs = await trx
      .select({
        id: songs.id,
        path: songs.path,
        duration: sql<number>`${songs.duration}::float`,
        sampleRate: songs.sampleRate,
        bitRate: songs.bitRate
      })
      .from(songs)
      .where(eq(songs.isBlacklisted, false));

    const totalTracks = librarySongs.length;
    let totalDurationSeconds = 0;
    let totalBitrate = 0;
    let bitrateCount = 0;
    let losslessCount = 0;
    let lossyCount = 0;
    let hiResCount = 0;

    const codecCounts = new Map<string, number>();
    const sampleRateCounts = new Map<number, number>();

    const LOSSLESS_EXTENSIONS = new Set(['.flac', '.alac', '.wav', '.aiff', '.dsf', '.dff', '.ape']);

    for (const song of librarySongs) {
      totalDurationSeconds += song.duration || 0;

      if (song.bitRate && song.bitRate > 0) {
        totalBitrate += song.bitRate;
        bitrateCount++;
      }

      // Codec / Extension extraction
      const extMatch = song.path.match(/\.([a-zA-Z0-9]+)$/);
      const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : '.unknown';
      const codecName = ext.replace('.', '').toUpperCase();

      codecCounts.set(codecName, (codecCounts.get(codecName) || 0) + 1);

      // Lossless vs Lossy
      if (LOSSLESS_EXTENSIONS.has(ext)) {
        losslessCount++;
      } else {
        lossyCount++;
      }

      // Sample Rate
      const sampleRate = song.sampleRate || 44100;
      sampleRateCounts.set(sampleRate, (sampleRateCounts.get(sampleRate) || 0) + 1);

      // Hi-Res check: sample rate >= 88.2kHz or bitrate >= 1411kbps
      if (sampleRate >= 88200 || (song.bitRate && song.bitRate >= 1411)) {
        hiResCount++;
      }
    }

    const averageBitrate = bitrateCount > 0 ? Math.round(totalBitrate / bitrateCount) : 0;

    // Codec breakdown array
    const codecBreakdown = Array.from(codecCounts.entries())
      .map(([codec, count]) => ({
        codec,
        count,
        percentage: totalTracks > 0 ? Math.round((count / totalTracks) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.count - a.count);

    // Sample rate breakdown array
    const sampleRateBreakdown = Array.from(sampleRateCounts.entries())
      .map(([sampleRate, count]) => ({
        sampleRate,
        count
      }))
      .sort((a, b) => b.sampleRate - a.sampleRate);

    return {
      totalTracks,
      totalDurationSeconds: Math.round(totalDurationSeconds),
      averageBitrate,
      losslessCount,
      lossyCount,
      hiResCount,
      codecBreakdown,
      sampleRateBreakdown
    };
  } catch (error) {
    logger.error('[MAIN] getLibraryAudioStats ERROR', { error });
    throw error;
  }
};
