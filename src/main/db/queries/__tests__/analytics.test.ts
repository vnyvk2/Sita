import { describe, expect, it } from 'vitest';

import { getCutoffDate, type HistoryPeriod } from '../analytics';

describe('Analytics Database Queries - Logic & Period Validation', () => {
  it('calculates exact cutoff dates for standard periods', () => {
    const now = Date.now();

    const cutoff7 = getCutoffDate('7');
    expect(cutoff7).toBeInstanceOf(Date);
    const diff7Days = (now - cutoff7!.getTime()) / (1000 * 60 * 60 * 24);
    expect(diff7Days).toBeCloseTo(7, 0.1);

    const cutoff30 = getCutoffDate('30');
    expect(cutoff30).toBeInstanceOf(Date);
    const diff30Days = (now - cutoff30!.getTime()) / (1000 * 60 * 60 * 24);
    expect(diff30Days).toBeCloseTo(30, 0.1);

    const cutoff180 = getCutoffDate('180');
    expect(cutoff180).toBeInstanceOf(Date);
    const diff180Days = (now - cutoff180!.getTime()) / (1000 * 60 * 60 * 24);
    expect(diff180Days).toBeCloseTo(180, 0.1);

    const cutoff365 = getCutoffDate('365');
    expect(cutoff365).toBeInstanceOf(Date);
    const diff365Days = (now - cutoff365!.getTime()) / (1000 * 60 * 60 * 24);
    expect(diff365Days).toBeCloseTo(365, 0.1);
  });

  it('returns undefined cutoff for "all" or invalid periods', () => {
    expect(getCutoffDate('all')).toBeUndefined();
    expect(getCutoffDate(undefined)).toBeUndefined();
    expect(getCutoffDate('invalid' as HistoryPeriod)).toBeUndefined();
    expect(getCutoffDate('-5' as HistoryPeriod)).toBeUndefined();
  });

  it('executes getListeningAnalytics and getLibraryAudioStats cleanly against DB', async () => {
    const { getListeningAnalytics, getLibraryAudioStats } = await import('../analytics');
    const listening = await getListeningAnalytics('30');
    expect(listening).toBeDefined();
    expect(listening.summary).toBeDefined();
    expect(Array.isArray(listening.hourlyDistribution)).toBe(true);
    expect(Array.isArray(listening.topArtists)).toBe(true);
    expect(Array.isArray(listening.topTracks)).toBe(true);

    const stats = await getLibraryAudioStats();
    expect(stats).toBeDefined();
    expect(typeof stats.totalTracks).toBe('number');
  });

  it('accurately buckets circadian rhythm hours and daily activity in local time', async () => {
    const { db } = await import('../../db');
    const { songs, playHistory } = await import('../../schema');
    const { getListeningAnalytics } = await import('../analytics');

    await db.delete(playHistory);
    await db.delete(songs);

    const now = new Date();
    const localHour = now.getHours();
    const pad = (n: number) => String(n).padStart(2, '0');
    const localDateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const [song] = await db
      .insert(songs)
      .values({
        title: 'Circadian Test Track',
        duration: 200,
        path: 'C:\\Music\\circadian_track.mp3',
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    await db.insert(playHistory).values({
      songId: song.id,
      createdAt: now,
      updatedAt: now
    });

    const analytics = await getListeningAnalytics('7');
    expect(analytics).toBeDefined();

    // Verify hourly distribution reflects local hour
    const hourBucket = analytics.hourlyDistribution.find((h) => h.hour === localHour);
    expect(hourBucket).toBeDefined();
    expect(hourBucket!.playCount).toBe(1);

    // Verify daily activity reflects local date string
    const dayBucket = analytics.dailyActivity.find((d) => d.date === localDateStr);
    expect(dayBucket).toBeDefined();
    expect(dayBucket!.playCount).toBe(1);
    expect(dayBucket!.seconds).toBe(200);
  });

  it('computes chronotype, skip forensics, audiophile metrics, and loop addiction accurately', async () => {
    const { db } = await import('../../db');
    const { songs, playHistory, skipEvents } = await import('../../schema');
    const { getListeningAnalytics } = await import('../analytics');

    await db.delete(skipEvents);
    await db.delete(playHistory);
    await db.delete(songs);

    const now = new Date();
    const [song1] = await db
      .insert(songs)
      .values({
        title: 'Masterpiece FLAC',
        duration: 300,
        sampleRate: 96000,
        bitRate: 2400,
        path: 'C:\\Music\\masterpiece.flac',
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    // 3 consecutive plays (triggers loop addiction)
    for (let i = 0; i < 3; i++) {
      await db.insert(playHistory).values({
        songId: song1.id,
        createdAt: new Date(now.getTime() - i * 1000),
        updatedAt: new Date(now.getTime() - i * 1000)
      });
    }

    // Skip at 3.2 seconds (triggers cold shoulder)
    await db.insert(skipEvents).values({
      songId: song1.id,
      position: 3.2,
      createdAt: now,
      updatedAt: now
    });

    const analytics = await getListeningAnalytics('7');
    expect(analytics).toBeDefined();

    // 1. Chronotype
    expect(analytics.chronotype).toBeDefined();
    expect(analytics.chronotype!.name).toBeTruthy();
    expect(analytics.chronotype!.segmentPercentages).toBeDefined();

    // 2. Skip Forensics
    expect(analytics.skipForensics).toBeDefined();
    expect(analytics.skipForensics!.totalSkips).toBeGreaterThanOrEqual(1);
    expect(analytics.skipForensics!.attentionCliff.length).toBe(5);
    expect(analytics.skipForensics!.coldShoulder).toBeDefined();
    expect(analytics.skipForensics!.coldShoulder!.title).toBe('Masterpiece FLAC');
    expect(analytics.skipForensics!.coldShoulder!.positionSecs).toBeCloseTo(3.2, 0.1);

    // 3. Audiophile Metrics
    expect(analytics.audiophileMetrics).toBeDefined();
    expect(analytics.audiophileMetrics!.losslessPercentage).toBe(100);
    expect(analytics.audiophileMetrics!.peakSampleRate).toBe(96000);
    expect(analytics.audiophileMetrics!.resolutionTier).toBe('Master Class');

    // 4. Loop Addiction
    expect(analytics.loopAddiction).toBeDefined();
    expect(analytics.loopAddiction!.hasAddiction).toBe(true);
    expect(analytics.loopAddiction!.streakCount).toBe(3);
    expect(analytics.loopAddiction!.title).toBe('Masterpiece FLAC');
  });
});
