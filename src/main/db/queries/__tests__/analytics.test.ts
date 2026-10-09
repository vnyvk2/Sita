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
});
