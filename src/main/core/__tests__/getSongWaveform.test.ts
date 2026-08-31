import fs from 'fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '../../db/db';
import { WAVEFORM_RESOLUTION } from '../../workers/jobs/waveformJob';
import { getSongWaveform } from '../getSongWaveform';

vi.mock('../../db/db', () => ({
  db: {
    query: {
      waveforms: {
        findFirst: vi.fn()
      }
    }
  }
}));

vi.mock('../../logger', () => ({
  default: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}));

describe('getSongWaveform Core Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid song IDs', async () => {
    expect(await getSongWaveform(0)).toBeNull();
    expect(await getSongWaveform(-5)).toBeNull();
    expect(await getSongWaveform(NaN)).toBeNull();
    expect(await getSongWaveform(1.5)).toBeNull();
  });

  it('returns null when song has no waveform row in DB', async () => {
    vi.mocked(db.query.waveforms.findFirst).mockResolvedValue(null as any);
    const result = await getSongWaveform(101);
    expect(result).toBeNull();
  });

  it('returns null when waveform file is missing on disk', async () => {
    vi.mocked(db.query.waveforms.findFirst).mockResolvedValue({
      id: 1,
      songId: 101,
      path: '/nonexistent/path/waveform.bin'
    } as any);

    vi.spyOn(fs.promises, 'stat').mockRejectedValue(new Error('ENOENT'));

    const result = await getSongWaveform(101);
    expect(result).toBeNull();
  });

  it('returns null when waveform file size is corrupted or truncated', async () => {
    vi.mocked(db.query.waveforms.findFirst).mockResolvedValue({
      id: 1,
      songId: 101,
      path: '/cache/waveforms/101_v1.bin'
    } as any);

    vi.spyOn(fs.promises, 'stat').mockResolvedValue({ size: 400 } as any); // Expected 800 bytes

    const result = await getSongWaveform(101);
    expect(result).toBeNull();
  });

  it('defensively sanitizes and clamps out-of-bounds, NaN, and Infinity peaks', async () => {
    vi.mocked(db.query.waveforms.findFirst).mockResolvedValue({
      id: 1,
      songId: 101,
      path: '/cache/waveforms/101_v1.bin'
    } as any);

    const EXPECTED_BYTES = WAVEFORM_RESOLUTION * 4;
    const testPeaks = new Float32Array(WAVEFORM_RESOLUTION);
    testPeaks[0] = 0.5;
    testPeaks[1] = 1.8; // Out of bounds (> 1)
    testPeaks[2] = -0.3; // Negative (< 0)
    testPeaks[3] = NaN; // NaN
    testPeaks[4] = Infinity; // Infinity
    testPeaks[5] = 0.9;

    const buffer = Buffer.from(testPeaks.buffer);

    vi.spyOn(fs.promises, 'stat').mockResolvedValue({ size: EXPECTED_BYTES } as any);
    vi.spyOn(fs.promises, 'readFile').mockResolvedValue(buffer as any);

    const result = await getSongWaveform(101);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(WAVEFORM_RESOLUTION);
    expect(result![0]).toBeCloseTo(0.5);
    expect(result![1]).toBe(1.0); // Clamped to 1.0
    expect(result![2]).toBe(0.0); // Clamped to 0.0
    expect(result![3]).toBe(0.0); // Clamped to 0.0
    expect(result![4]).toBe(0.0); // Clamped to 0.0
    expect(result![5]).toBeCloseTo(0.9);
  });
});
