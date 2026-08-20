import fs from 'node:fs';
import path from 'node:path';

import { ipcMain } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setupSpotifyIpc } from '../../../../src/main/spotify/ipc/setupSpotifyIpc';

describe('Spotify IPC Contract Parity (Dynamic Preload Literal Extraction & Main Parity)', () => {
  const registeredMainChannels: string[] = [];

  beforeEach(() => {
    registeredMainChannels.length = 0;
    vi.spyOn(ipcMain, 'handle').mockImplementation(((channel: string) => {
      registeredMainChannels.push(channel);
      return {} as any;
    }) as any);
  });

  /**
   * Dynamically extracts all direct spotify/* ipcRenderer.invoke literal channels declared in src/preload/index.ts.
   */
  function extractPreloadSpotifyChannels(): string[] {
    const preloadPath = path.resolve(__dirname, '../../../../src/preload/index.ts');
    expect(fs.existsSync(preloadPath), 'Preload file must exist').toBe(true);
    const content = fs.readFileSync(preloadPath, 'utf8');

    const channelMatches = [...content.matchAll(/ipcRenderer\.invoke\(\s*['"](spotify\/[^'"]+)['"]/g)];
    const channels = Array.from(new Set(channelMatches.map((m) => m[1])));

    expect(channels.length).toBeGreaterThan(0);
    return channels;
  }

  it('should guarantee exact 1:1 bidirectional equality between preload Spotify bridge and main IPC handlers', () => {
    // 1. Extract source of truth channels from preload
    const preloadChannels = extractPreloadSpotifyChannels();

    // 2. Register main handlers
    setupSpotifyIpc({} as any, {} as any, {} as any, {} as any);

    // Filter main channels to spotify/* namespace
    const mainSpotifyChannels = registeredMainChannels.filter((c) => c.startsWith('spotify/'));

    // 3. Assert exact bidirectional equality
    expect(mainSpotifyChannels.sort()).toEqual(preloadChannels.sort());
    expect(mainSpotifyChannels.length).toBe(preloadChannels.length);
  });
});
