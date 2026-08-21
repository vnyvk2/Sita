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
});
