/**
 * Nora Native Audio Engine JSON-Lines Daemon Protocol Definitions.
 * Aligns strictly with crates/engine-cli/src/protocol.rs.
 */

export type SlotId = 'a' | 'b';

export type PlaybackState = 'playing' | 'paused' | 'stopped';

export type DaemonCommand =
  | { cmd: 'load'; slot: SlotId; path: string }
  | { cmd: 'preload'; path: string }
  | { cmd: 'play' }
  | { cmd: 'pause' }
  | { cmd: 'stop' }
  | { cmd: 'seek'; position_secs: number }
  | { cmd: 'crossfade'; duration_ms: number }
  | { cmd: 'set_volume'; volume: number }
  | { cmd: 'set_eq'; gains: [number, number, number, number, number, number, number, number, number, number] }
  | { cmd: 'set_dsp'; bypass: boolean; rg_db: number; karaoke: boolean; limiter: boolean }
  | { cmd: 'list_devices' }
  | { cmd: 'set_device'; device_id: string }
  | { cmd: 'get_state' };

export type DaemonRequest = DaemonCommand & {
  id: number;
};

export interface DaemonLoadResultData {
  slot: SlotId;
  path: string;
  cued: boolean;
  duration_secs: number;
  sample_rate: number;
  channels: number;
  codec: string;
}

export interface DaemonStateResultData {
  state: PlaybackState;
  active_slot: SlotId;
  volume: number;
  backend: string;
  xrun_count: number;
  low_water_mark: number;
}

export type DaemonResponse =
  | {
      id: number;
      status: 'ok';
      data?: DaemonLoadResultData | DaemonStateResultData | unknown;
    }
  | {
      id: number;
      status: 'error';
      message: string;
    };

export type DaemonPushEvent =
  | {
      event: 'ready';
      protocol_version: number;
      engine_version: string;
    }
  | {
      event: 'state_changed';
      state: PlaybackState;
      position_secs?: number;
    }
  | {
      event: 'slot_end';
      slot: SlotId;
    }
  | {
      event: 'track_end';
      slot: SlotId;
    }
  | {
      event: 'transition_complete';
      active_slot: SlotId;
    }
  | {
      event: 'xrun';
      count: number;
    }
  | {
      event: 'device_error';
      message: string;
    }
  | {
      event: 'heartbeat';
      active_slot: SlotId;
      position_secs: number;
      duration_secs: number;
      wallclock_ms: number;
      is_playing: boolean;
    };
