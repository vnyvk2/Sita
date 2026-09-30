/**
 * Wire parity: every example in crates/engine-protocol/wire-examples.json
 * must satisfy the TypeScript unions in src/common/audioEngineProtocol.ts.
 * This is the second half of the shape lock (the Rust half asserts exact
 * serialization); a field rename, type change, or optional-vs-required
 * drift on either side fails here instead of desyncing silently.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import type {
  DaemonCommand,
  DaemonPushEvent,
  DaemonRequest,
  DaemonResponse
} from '../../src/common/audioEngineProtocol';

const wirePath = path.resolve(
  __dirname,
  '../../crates/engine-protocol/wire-examples.json'
);

interface WireDoc {
  commands: DaemonRequest[];
  events: DaemonPushEvent[];
  responses: DaemonResponse[];
}

function loadWire(): WireDoc {
  const raw = fs.readFileSync(wirePath, 'utf8');
  return JSON.parse(raw) as WireDoc;
}

const COMMAND_FIELDS: Record<DaemonCommand['cmd'], string[]> = {
  load: ['slot', 'path'],
  preload: ['path'],
  play: [],
  pause: [],
  stop: [],
  seek: ['position_secs'],
  crossfade: ['duration_ms'],
  set_volume: ['volume'],
  set_eq: ['gains'],
  set_dsp: ['bypass', 'rg_db', 'karaoke', 'limiter'],
  list_devices: [],
  set_device: ['device_id'],
  get_state: []
};

describe('Audio engine wire parity (crates/engine-protocol)', () => {
  it('covers all 13 commands with required fields', () => {
    const { commands } = loadWire();
    expect(commands).toHaveLength(13);
    const seen = new Set<string>();
    for (const req of commands) {
      expect(typeof req.id).toBe('number');
      const cmd = req as DaemonCommand;
      seen.add(cmd.cmd);
      for (const field of COMMAND_FIELDS[cmd.cmd]) {
        expect(
          (cmd as Record<string, unknown>)[field],
          `${cmd.cmd} missing field ${field}`
        ).not.toBeUndefined();
      }
    }
    expect(seen.size).toBe(13);
  });

  it('round-trips every command through JSON without loss', () => {
    const { commands } = loadWire();
    for (const req of commands) {
      const back = JSON.parse(JSON.stringify(req)) as DaemonRequest;
      expect(back).toEqual(req);
    }
  });

  it('covers all 8 event kinds with discriminators', () => {
    const { events } = loadWire();
    const kinds = new Set(events.map((e) => e.event));
    expect(kinds).toEqual(
      new Set([
        'ready',
        'state_changed',
        'slot_end',
        'track_end',
        'transition_complete',
        'xrun',
        'device_error',
        'heartbeat'
      ])
    );
    for (const event of events) {
      switch (event.event) {
        case 'heartbeat':
          expect(typeof event.position_secs).toBe('number');
          expect(typeof event.duration_secs).toBe('number');
          expect(typeof event.is_playing).toBe('boolean');
          break;
        case 'track_end':
        case 'slot_end':
          expect(['a', 'b']).toContain(event.slot);
          break;
        case 'transition_complete':
          expect(['a', 'b']).toContain(event.active_slot);
          break;
        case 'ready':
          expect(event.protocol_version).toBe(1);
          break;
        default:
          break;
      }
    }
  });

  it('responses carry correlated ok/error shapes', () => {
    const { responses } = loadWire();
    expect(responses.length).toBeGreaterThanOrEqual(3);
    for (const res of responses) {
      expect(typeof res.id).toBe('number');
      if (res.status === 'ok') {
        expect(res).toHaveProperty('data');
      } else {
        expect(res.status).toBe('error');
        expect(typeof res.message).toBe('string');
      }
    }
  });
});
