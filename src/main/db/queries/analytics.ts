import { desc, eq, gte, inArray, sql } from 'drizzle-orm';

import type {
  AttentionCliffBucket,
  AudiophileListeningMetrics,
  ChronotypeData,
  LoopAddictionItem,
  SkipForensicsData
} from '../../../common/analytics';
import { parseArtistArtworks, parseSongArtworks } from '../../fs/resolveFilePaths';
import logger from '../../logger';
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

/** Aggregates listening analytics for a given time period using PGLite SQL queries. */
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
      totalPlayAttempts > 0
        ? Math.min(1, Math.max(0, fullListens / totalPlayAttempts))
        : totalPlaysCount > 0
          ? 0.9
          : 1.0;

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
        // created_at is epoch-ms: strftime over unixepoch seconds in local time (pg: to_char(col,'YYYY-MM-DD'))
        date: sql<string>`strftime('%Y-%m-%d', ${playHistory.createdAt} / 1000, 'unixepoch', 'localtime')`,
        playCount: sql<number>`count(*)`,
        seconds: sql<number>`coalesce(sum(${songs.duration}), 0)`
      })
      .from(playHistory)
      .innerJoin(songs, eq(playHistory.songId, songs.id))
      .where(playHistoryWhere)
      .groupBy(sql`strftime('%Y-%m-%d', ${playHistory.createdAt} / 1000, 'unixepoch', 'localtime')`)
      .orderBy(
        sql`strftime('%Y-%m-%d', ${playHistory.createdAt} / 1000, 'unixepoch', 'localtime') ASC`
      );

    const dailyActivity: DailyActivityItem[] = dailyRecords.map((r) => ({
      date: r.date,
      playCount: r.playCount,
      seconds: r.seconds
    }));

    // 3. Hourly Circadian Distribution (0..23 hours)
    const hourlyRecords = await trx
      .select({
        hour: sql<number>`cast(strftime('%H', ${playHistory.createdAt} / 1000, 'unixepoch', 'localtime') as integer)`,
        playCount: sql<number>`count(*)`
      })
      .from(playHistory)
      .where(playHistoryWhere)
      .groupBy(
        sql`cast(strftime('%H', ${playHistory.createdAt} / 1000, 'unixepoch', 'localtime') as integer)`
      );

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

    // 7. Chronotype Engine
    let peakHour = 0;
    let maxHourPlays = -1;
    let nightPlays = 0;
    let morningPlays = 0;
    let afternoonPlays = 0;
    let eveningPlays = 0;

    for (const h of hourlyDistribution) {
      if (h.playCount > maxHourPlays) {
        maxHourPlays = h.playCount;
        peakHour = h.hour;
      }
      if (h.hour < 6) nightPlays += h.playCount;
      else if (h.hour < 12) morningPlays += h.playCount;
      else if (h.hour < 18) afternoonPlays += h.playCount;
      else eveningPlays += h.playCount;
    }

    const totalPeriodPlays = nightPlays + morningPlays + afternoonPlays + eveningPlays || 1;
    const segmentPercentages = {
      night: Math.round((nightPlays / totalPeriodPlays) * 100),
      morning: Math.round((morningPlays / totalPeriodPlays) * 100),
      afternoon: Math.round((afternoonPlays / totalPeriodPlays) * 100),
      evening: Math.round((eveningPlays / totalPeriodPlays) * 100)
    };

    let peakSegment: 'night' | 'morning' | 'afternoon' | 'evening' = 'night';
    let maxSegPlays = nightPlays;
    if (morningPlays > maxSegPlays) {
      peakSegment = 'morning';
      maxSegPlays = morningPlays;
    }
    if (afternoonPlays > maxSegPlays) {
      peakSegment = 'afternoon';
      maxSegPlays = afternoonPlays;
    }
    if (eveningPlays > maxSegPlays) {
      peakSegment = 'evening';
      maxSegPlays = eveningPlays;
    }

    const chronotypeProfiles = {
      night: { name: 'Vampiric Night Owl', icon: 'bedtime' },
      morning: { name: 'Dawn Chaser', icon: 'wb_sunny' },
      afternoon: { name: 'Daytime Velocity', icon: 'bolt' },
      evening: { name: 'Twilight Dreamer', icon: 'nightlight' }
    };

    const chronotype: ChronotypeData = {
      name: chronotypeProfiles[peakSegment].name,
      icon: chronotypeProfiles[peakSegment].icon,
      peakHour,
      peakSegment,
      segmentPercentages
    };

    // 8. Skip Forensics (Attention Cliff & Awards)
    const rawSkips = await trx
      .select({
        position: skipEvents.position,
        songId: skipEvents.songId,
        songTitle: songs.title,
        duration: songs.duration
      })
      .from(skipEvents)
      .innerJoin(songs, eq(skipEvents.songId, songs.id))
      .where(skipEventsWhere)
      .orderBy(desc(skipEvents.createdAt))
      .limit(500);

    let cliff0_5 = 0;
    let cliff6_15 = 0;
    let cliff16_30 = 0;
    let cliff31_60 = 0;
    let cliffOutro = 0;

    let coldShoulder: SkipForensicsData['coldShoulder'] = undefined;
    let minSkipPos = Infinity;

    let theTragedy: SkipForensicsData['theTragedy'] = undefined;
    let maxCompletionPct = 0;

    for (const s of rawSkips) {
      const pos = s.position || 0;
      const dur = s.duration || 1;
      const completionRatio = Math.min(1, pos / dur);

      if (pos <= 5) cliff0_5++;
      else if (pos <= 15) cliff6_15++;
      else if (pos <= 30) cliff16_30++;
      else if (pos <= 60) cliff31_60++;
      else if (completionRatio >= 0.85) cliffOutro++;

      if (pos < minSkipPos && pos >= 0.5) {
        minSkipPos = pos;
        coldShoulder = {
          songId: s.songId,
          title: s.songTitle,
          positionSecs: Math.round(pos * 10) / 10
        };
      }

      if (completionRatio >= 0.85 && completionRatio > maxCompletionPct && dur - pos <= 20) {
        maxCompletionPct = completionRatio;
        theTragedy = {
          songId: s.songId,
          title: s.songTitle,
          completionPercentage: Math.round(completionRatio * 1000) / 10
        };
      }
    }

    const totalCliffSkips = rawSkips.length || 1;
    const attentionCliff: AttentionCliffBucket[] = [
      {
        label: '0-5s',
        count: cliff0_5,
        percentage: Math.round((cliff0_5 / totalCliffSkips) * 100)
      },
      {
        label: '6-15s',
        count: cliff6_15,
        percentage: Math.round((cliff6_15 / totalCliffSkips) * 100)
      },
      {
        label: '16-30s',
        count: cliff16_30,
        percentage: Math.round((cliff16_30 / totalCliffSkips) * 100)
      },
      {
        label: '31-60s',
        count: cliff31_60,
        percentage: Math.round((cliff31_60 / totalCliffSkips) * 100)
      },
      {
        label: 'Outro (>85%)',
        count: cliffOutro,
        percentage: Math.round((cliffOutro / totalCliffSkips) * 100)
      }
    ];

    const patienceScore = Math.round(completionRate * 100);
    let skipArchetype = 'Zen Monk';
    if (patienceScore < 45) skipArchetype = 'TikTok Attention Span';
    else if (patienceScore < 70) skipArchetype = 'Ruthless Filter';
    else if (patienceScore < 85) skipArchetype = 'Patient Listener';

    const skipForensics: SkipForensicsData = {
      totalSkips: totalSkipsCount,
      patienceScore,
      archetype: skipArchetype,
      attentionCliff,
      coldShoulder,
      theTragedy
    };

    // 9. Audiophile Listening Metrics
    const playedSongsQuality = await trx
      .select({
        duration: songs.duration,
        path: songs.path,
        sampleRate: songs.sampleRate,
        bitRate: songs.bitRate
      })
      .from(playHistory)
      .innerJoin(songs, eq(playHistory.songId, songs.id))
      .where(playHistoryWhere)
      .limit(1000);

    let losslessPlays = 0;
    let hiResPlays = 0;
    let cdQualityPlays = 0;
    let mp3HighPlays = 0;
    let lossyOtherPlays = 0;
    let peakSampleRate = 44100;

    const LOSSLESS_EXTENSIONS = new Set([
      '.flac',
      '.alac',
      '.wav',
      '.aiff',
      '.dsf',
      '.dff',
      '.ape'
    ]);

    for (const ps of playedSongsQuality) {
      const extMatch = ps.path?.match(/\.([a-zA-Z0-9]+)$/);
      const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : '';
      const sr = ps.sampleRate || 44100;
      if (sr > peakSampleRate) peakSampleRate = sr;

      const isLossless = LOSSLESS_EXTENSIONS.has(ext);
      if (isLossless) losslessPlays++;

      if (sr >= 88200 || (ps.bitRate && ps.bitRate >= 1411)) {
        hiResPlays++;
      } else if (isLossless) {
        cdQualityPlays++;
      } else if (ps.bitRate && ps.bitRate >= 320) {
        mp3HighPlays++;
      } else {
        lossyOtherPlays++;
      }
    }

    const totalQualityPlays = playedSongsQuality.length || 1;
    const losslessPercentage = Math.round((losslessPlays / totalQualityPlays) * 100);
    const rawPcmGigabytes =
      Math.round(((totalListeningSeconds * 44100 * 4) / (1024 * 1024 * 1024)) * 100) / 100;

    let resolutionTier: AudiophileListeningMetrics['resolutionTier'] = 'Compressed';
    if (losslessPercentage >= 80)
      resolutionTier = hiResPlays > cdQualityPlays ? 'Master Class' : 'Hi-Fi Grade';
    else if (losslessPercentage >= 40) resolutionTier = 'Standard Lossless';

    const audiophileMetrics: AudiophileListeningMetrics = {
      rawPcmGigabytes,
      losslessPercentage,
      peakSampleRate,
      resolutionTier,
      dominantResolution:
        hiResPlays > cdQualityPlays
          ? '24-bit / 96kHz+ Hi-Res'
          : losslessPlays > 0
            ? '16-bit / 44.1kHz FLAC'
            : '320kbps MP3',
      spectrum: {
        hiResPercent: Math.round((hiResPlays / totalQualityPlays) * 100),
        cdQualityPercent: Math.round((cdQualityPlays / totalQualityPlays) * 100),
        mp3HighPercent: Math.round((mp3HighPlays / totalQualityPlays) * 100),
        lossyOtherPercent: Math.round((lossyOtherPlays / totalQualityPlays) * 100)
      }
    };

    // 10. Loop Addiction Detector (consecutive streak of same song)
    const recentPlayRuns = await trx
      .select({
        songId: playHistory.songId,
        title: songs.title,
        duration: songs.duration,
        createdAt: playHistory.createdAt
      })
      .from(playHistory)
      .innerJoin(songs, eq(playHistory.songId, songs.id))
      .where(playHistoryWhere)
      .orderBy(desc(playHistory.createdAt))
      .limit(300);

    let maxStreak = 0;
    let streakSongId: number | undefined;
    let streakSongTitle: string | undefined;
    let streakSongDuration = 0;
    let streakLastPlayed: string | undefined;

    let currentStreak = 0;
    let currentSongId: number | undefined;

    for (const r of recentPlayRuns) {
      if (r.songId === currentSongId) {
        currentStreak++;
      } else {
        if (currentStreak > maxStreak) {
          maxStreak = currentStreak;
          streakSongId = currentSongId;
          const matched = recentPlayRuns.find((item) => item.songId === currentSongId);
          streakSongTitle = matched?.title;
          streakSongDuration = matched?.duration || 0;
          streakLastPlayed = matched?.createdAt
            ? new Date(matched.createdAt).toLocaleDateString()
            : undefined;
        }
        currentSongId = r.songId;
        currentStreak = 1;
      }
    }
    if (currentStreak > maxStreak) {
      maxStreak = currentStreak;
      streakSongId = currentSongId;
      const matched = recentPlayRuns.find((item) => item.songId === currentSongId);
      streakSongTitle = matched?.title;
      streakSongDuration = matched?.duration || 0;
      streakLastPlayed = matched?.createdAt
        ? new Date(matched.createdAt).toLocaleDateString()
        : undefined;
    }

    const loopAddiction: LoopAddictionItem = {
      hasAddiction: maxStreak >= 3,
      streakCount: maxStreak,
      songId: streakSongId,
      title: streakSongTitle,
      totalLoopMinutes: Math.round((maxStreak * streakSongDuration) / 60),
      lastPlayedAt: streakLastPlayed
    };

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
      topTracks,
      skipForensics,
      audiophileMetrics,
      loopAddiction,
      chronotype
    };
  } catch (error) {
    logger.error('[MAIN] getListeningAnalytics ERROR', { error, period });
    throw error;
  }
};

/** Aggregates current audio library quality, formats, and codec statistics. */
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

    const LOSSLESS_EXTENSIONS = new Set([
      '.flac',
      '.alac',
      '.wav',
      '.aiff',
      '.dsf',
      '.dff',
      '.ape'
    ]);

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
