import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { File } from 'node-taglib-sharp';

// Scoped passthrough mock so individual tests can force the final rename to fail.
// state.impl === null -> delegate to the real rename captured at factory time.
const { renameState } = vi.hoisted(() => ({
  renameState: { impl: null as null | ((...args: unknown[]) => Promise<void>) }
}));
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    rename: ((...args: Parameters<typeof actual.rename>) =>
      renameState.impl
        ? (renameState.impl as (...a: unknown[]) => Promise<void>)(...args)
        : actual.rename(...args)) as typeof actual.rename
  };
});

import { withAtomicFileWrite } from '../withAtomicFileWrite';

describe('withAtomicFileWrite — atomic tag save invariants', () => {
  let tempSongPath: string;
  let originalBytes: Buffer;

  beforeEach(() => {
    // Default passthrough; individual tests may override with rejection
    renameState.impl = null;
    tempSongPath = path.join(
      os.tmpdir(),
      `atomic_write_test_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`
    );
    fs.copyFileSync(path.join(process.cwd(), 'test', 'assets', 'test_song.mp3'), tempSongPath);
    originalBytes = fs.readFileSync(tempSongPath);
  });

  afterEach(() => {
    if (fs.existsSync(tempSongPath)) fs.unlinkSync(tempSongPath);
    // No temp litter may survive any outcome
    const siblings = fs
      .readdirSync(path.dirname(tempSongPath))
      .filter((f) => f.startsWith(`.${path.basename(tempSongPath)}`));
    expect(siblings).toEqual([]);
  });

  it('replaces the original only via a fully saved temp file on success', async () => {
    await withAtomicFileWrite(tempSongPath, async (file) => {
      file.tag.title = 'Atomically Written';
    });

    const probe = File.createFromPath(tempSongPath);
    expect(probe.tag.title).toBe('Atomically Written');
    probe.dispose();

    // Content actually changed on disk
    expect(fs.readFileSync(tempSongPath).equals(originalBytes)).toBe(false);
  });

  it('leaves the original byte-identical when the mutation throws', async () => {
    await expect(
      withAtomicFileWrite(tempSongPath, async () => {
        throw new Error('mid-mutation explosion');
      })
    ).rejects.toThrow('mid-mutation explosion');

    expect(fs.readFileSync(tempSongPath).equals(originalBytes)).toBe(true);
  });

  it('leaves the original byte-identical when the final replace (rename) fails', async () => {
    // Simulate the original being locked at swap time (e.g. player holding it)
    renameState.impl = async () => {
      throw new Error('EBUSY: resource busy');
    };

    await expect(
      withAtomicFileWrite(tempSongPath, (file) => {
        file.tag.title = 'Should Never Land';
      })
    ).rejects.toThrow('EBUSY');

    expect(fs.readFileSync(tempSongPath).equals(originalBytes)).toBe(true);
  });
});
