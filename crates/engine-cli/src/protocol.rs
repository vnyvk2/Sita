//! JSON-Lines Daemon Protocol Schemas for the Nora Audio Engine Daemon (`engine-cli`).

use serde::{Deserialize, Serialize};

/// Slot identifier matching engine-lib.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SlotId {
    A,
    B,
}

/// Playback lifecycle state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlaybackState {
    Playing,
    Paused,
    Stopped,
}

/// 13-Command Schema for daemon control over stdin.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub enum DaemonCommand {
    Load {
        slot: SlotId,
        path: String,
    },
    Preload {
        path: String,
    },
    Play,
    Pause,
    Stop,
    Seek {
        position_secs: f64,
    },
    Crossfade {
        duration_ms: u32,
    },
    SetVolume {
        volume: f32,
    },
    SetEq {
        gains: [f32; 10],
    },
    SetDsp {
        bypass: bool,
        rg_db: f32,
        karaoke: bool,
        limiter: bool,
    },
    ListDevices,
    SetDevice {
        id: String,
    },
    GetState,
}

/// 5-Event Schema emitted asynchronously over daemon stdout.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum DaemonEvent {
    StateChanged {
        state: PlaybackState,
    },
    Eos {
        slot: SlotId,
    },
    Xrun {
        count: u64,
    },
    DeviceError {
        message: String,
    },
    Heartbeat {
        active_slot: SlotId,
        position_secs: f64,
        duration_secs: f64,
        wallclock_ms: u64,
        is_playing: bool,
    },
}

/// Synchronous response to a command sent over stdout.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum DaemonResponse {
    Ok {
        #[serde(skip_serializing_if = "Option::is_none")]
        data: Option<serde_json::Value>,
    },
    Error {
        message: String,
    },
}
