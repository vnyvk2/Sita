import { eq, gte, inArray, sql } from 'drizzle-orm';
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
        totalPlays: sql<number>`count(*)`,
        uniqueSongs: sql<number>`count(distinct ${playHistory.songId})`
      })
      .from(playHistory)
      .where(playHistoryWhere);

    const [eventsAgg] = await trx
      .select({
        totalListenedSeconds: sql<number>`coalesce(sum(${songs.duration} * (${playEvents.playbackPercentage})), 0)`,
        fullListensCount: sql<number>`count(case when ${playEvents.playbackPercentage} >= 0.85 then 1 end)`,
        totalRecordedEvents: sql<number>`count(*)`
      })
      .from(playEvents)
      .innerJoin(songs, eq(playEvents.songId, songs.id))
      .where(playEventsWhere);

    const [skipsAgg] = await trx
      .select({
        totalSkips: sql<number>`count(*)`
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
        uniqueArtists: sql<number>`count(distinct ${artistsSongs.artistId})`
      })
      .from(playHistory)
      .innerJoin(artistsSongs, eq(playHistory.songId, artistsSongs.songId))
      .where(playHistoryWhere);

    const uniqueArtistsPlayed = uniqueArtistsAgg?.uniqueArtists ?? 0;

    // 2. Daily Activity (Date Bucketing)
    const dailyRecords = await trx
      .select({
        // created_at is epoch-ms: strftime over unixepoch seconds (pg: to_char(col,'YYYY-MM-DD'))
        date: sql<string>`strftime('%Y-%m-%d', ${playHistory.createdAt} / 1000, 'unixepoch')`,
        playCount: sql<number>`count(*)`,
        seconds: sql<number>`coalesce(sum(${songs.duration}), 0)`
      })
      .from(playHistory)
      .innerJoin(songs, eq(playHistory.songId, songs.id))
      .where(playHistoryWhere)
      .groupBy(sql`strftime('%Y-%m-%d', ${playHistory.createdAt} / 1000, 'unixepoch')`)
      .orderBy(sql`strftime('%Y-%m-%d', ${playHistory.createdAt} / 1000, 'unixepoch') ASC`);

    const dailyActivity: DailyActivityItem[] = dailyRecords.map((r) => ({
      date: r.date,
      playCount: r.playCount,
      seconds: r.seconds
    }));

    // 3. Hourly Circadian Distribution (0..23 hours)
    const hourlyRecords = await trx
      .select({
        hour: sql<number>`cast(strftime('%H', ${playHistory.createdAt} / 1000, 'unixepoch') as integer)`,
        playCount: sql<number>`count(*)`
      })
      .from(playHistory)
      .where(playHistoryWhere)
      .groupBy(sql`cast(strftime('%H', ${playHistory.createdAt} / 1000, 'unixepoch') as integer)`);

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
        playCount: sql<number>`count(*)`,
        totalSeconds: sql<number>`coalesce(sum(${songs.duration}), 0)`
      })
      .from(playHistory)
      .innerJoin(artistsSongs, eq(playHistory.songId, artistsSongs.songId))
      .innerJoin(artists, eq(artistsSongs.artistId, artists.id))
      .innerJoin(songs, eq(playHistory.songId, songs.id))
      .where(playHistoryWhere)
      .groupBy(artists.id, artists.name)
      .orderBy(sql`count(*) DESC`, sql`sum(${songs.duration}) DESC`)
      .limit(10);

    const topArtistIds = artistHistoryRecords.map((a) => a.artistId);
    const artistArtworksList =
      topArtistIds.length > 0
        ? await trx
            .select({
              artistId: artistsArtworks.artistId,
              path: artworks.path,
              isOptimized: artworks.isOptimized,
              source: artworks.source
            })
            .from(artistsArtworks)
            .innerJoin(artworks, eq(artistsArtworks.artworkId, artworks.id))
            .where(inArray(artistsArtworks.artistId, topArtistIds))
        : [];

    const artistArtworksMap = new Map<number, Array<{ path: string; isOptimized: boolean }>>();
    for (const art of artistArtworksList) {
      if (!art.path) continue;
      const list = artistArtworksMap.get(art.artistId) || [];
      list.push({ path: art.path, isOptimized: Boolean(art.isOptimized) });
      artistArtworksMap.set(art.artistId, list);
    }

    const topArtists: TopArtistItem[] = artistHistoryRecords.map((a) => {
      const arts = artistArtworksMap.get(a.artistId);
      const artworkPaths =
        arts && arts.length > 0
          ? parseArtistArtworks(arts as unknown as (typeof artworks.$inferSelect)[])
          : undefined;
      return {
        artistId: a.artistId,
        name: a.name,
        artworkPaths,
        playCount: a.playCount,
        totalSeconds: a.totalSeconds
      };
    });

    // 5. Top Genres Rankings
    const genreHistoryRecords = await trx
      .select({
        genreId: genres.id,
        name: genres.name,
        playCount: sql<number>`count(*)`
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
        duration: sql<number>`${songs.duration}`,
        playCount: sql<number>`count(*)`,
        totalSeconds: sql<number>`coalesce(sum(${songs.duration}), 0)`
      })
      .from(playHistory)
      .innerJoin(songs, eq(playHistory.songId, songs.id))
      .where(playHistoryWhere)
      .groupBy(songs.id, songs.title, songs.duration)
      .orderBy(sql`count(*) DESC`, sql`sum(${songs.duration}) DESC`)
      .limit(10);

    const trackSongIds = trackHistoryRecords.map((t) => t.songId);

    // Batch fetch artists for all top tracks
    const allTrackArtists =
      trackSongIds.length > 0
        ? await trx
            .select({
              songId: artistsSongs.songId,
              artistId: artists.id,
              name: artists.name
            })
            .from(artistsSongs)
            .innerJoin(artists, eq(artistsSongs.artistId, artists.id))
            .where(inArray(artistsSongs.songId, trackSongIds))
        : [];

    const trackArtistsMap = new Map<number, Array<{ artistId: number; name: string }>>();
    for (const ta of allTrackArtists) {
      const list = trackArtistsMap.get(ta.songId) || [];
      list.push({ artistId: ta.artistId, name: ta.name });
      trackArtistsMap.set(ta.songId, list);
    }

    // Batch fetch albums for all top tracks
    const allTrackAlbums =
      trackSongIds.length > 0
        ? await trx
            .select({
              songId: albumsSongs.songId,
              albumId: albums.id,
              title: albums.title
            })
            .from(albumsSongs)
            .innerJoin(albums, eq(albumsSongs.albumId, albums.id))
            .where(inArray(albumsSongs.songId, trackSongIds))
        : [];

    const trackAlbumMap = new Map<number, { albumId: number; title: string }>();
    for (const al of allTrackAlbums) {
      if (!trackAlbumMap.has(al.songId)) {
        trackAlbumMap.set(al.songId, { albumId: al.albumId, title: al.title });
      }
    }

    // Batch fetch artworks for all top tracks
    const allTrackArtworks =
      trackSongIds.length > 0
        ? await trx
            .select({
              songId: artworksSongs.songId,
              path: artworks.path,
              isOptimized: artworks.isOptimized
            })
            .from(artworksSongs)
            .innerJoin(artworks, eq(artworksSongs.artworkId, artworks.id))
            .where(inArray(artworksSongs.songId, trackSongIds))
        : [];

    const trackArtworkMap = new Map<number, Array<{ path: string; isOptimized: boolean }>>();
    for (const art of allTrackArtworks) {
      if (!art.path) continue;
      const list = trackArtworkMap.get(art.songId) || [];
      list.push({ path: art.path, isOptimized: Boolean(art.isOptimized) });
      trackArtworkMap.set(art.songId, list);
    }

    const topTracks: TopTrackItem[] = trackHistoryRecords.map((t) => {
      const trackArtists = trackArtistsMap.get(t.songId) || [];
      const trackAlbum = trackAlbumMap.get(t.songId);
      const trackArts = trackArtworkMap.get(t.songId);

      const artworkPaths =
        trackArts && trackArts.length > 0
          ? parseSongArtworks(trackArts as unknown as (typeof artworks.$inferSelect)[])
          : undefined;

      return {
        songId: t.songId,
        title: t.title,
        duration: Number(t.duration),
        artists: trackArtists,
        album: trackAlbum,
        artworkPaths,
        playCount: t.playCount,
        totalSeconds: t.totalSeconds
      };
    });

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
        duration: sql<number>`${songs.duration}`,
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
