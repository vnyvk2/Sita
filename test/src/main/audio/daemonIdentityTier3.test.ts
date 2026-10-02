import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  formatDaemonIdentity,
  NativeAudioDaemonManager
} from '@main/audio/NativeAudioDaemonManager';
import logger from '@main/logger';

// T3-1: daemon launch identity is observable (binaryPath + engine_version +
// boot_id per boot), so a stale binary is a log lookup, not a mystery.

describe('T3-1 daemon identity logging', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('formats the full identity from path and ready handshake', () => {
    expect(
      formatDaemonIdentity(
        'C:\\nora\\resources\\bin\\engine-cli.exe',
        { event: 'ready', protocol_version: 1, engine_version: '0.4.2', boot_id: 99 },
        1728000000000
      )
    ).toEqual({
      binaryPath: 'C:\\nora\\resources\\bin\\engine-cli.exe',
      engineVersion: '0.4.2',
      bootId: 99,
      protocolVersion: 1,
      binaryMtimeMs: 1728000000000
    });
  });

  it('omits mtime when unavailable and nulls missing handshake fields', () => {
    expect(formatDaemonIdentity('/usr/bin/engine-cli', null)).toEqual({
      binaryPath: '/usr/bin/engine-cli',
      engineVersion: null,
      bootId: null,
      protocolVersion: null
    });
  });

  it('logs one consolidated identity line on the ready handshake', () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
    const manager = new NativeAudioDaemonManager();
    (manager as any).lastBinaryPath = 'C:\\nora\\target\\release\\engine-cli.exe';
    (manager as any).handleStdoutLine(
      JSON.stringify({
        event: 'ready',
        protocol_version: 1,
        engine_version: '0.4.2',
        boot_id: 7
      })
    );
    const identityCall = info.mock.calls.find((c) => c[0] === 'Native audio daemon identity:');
    expect(identityCall).toBeDefined();
    expect(identityCall![1]).toMatchObject({
      binaryPath: 'C:\\nora\\target\\release\\engine-cli.exe',
      engineVersion: '0.4.2',
      bootId: 7,
      protocolVersion: 1
    });
  });
});
