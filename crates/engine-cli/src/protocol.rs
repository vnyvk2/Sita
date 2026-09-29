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

/// Inbound command envelope with explicit correlation ID.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DaemonRequest {
    pub id: u64,
    #[serde(flatten)]
    pub command: DaemonCommand,
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
        device_id: String,
    },
    GetState,
}

/// Push Event Schema emitted asynchronously over daemon stdout.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum DaemonEvent {
    /// Startup handshake verifying pipe readiness and protocol compatibility.
    Ready {
        protocol_version: u32,
        engine_version: String,
    },
    StateChanged {
        state: PlaybackState,
        #[serde(skip_serializing_if = "Option::is_none")]
        position_secs: Option<f64>,
    },
    /// Informational: single slot buffer drained.
    SlotEnd {
        slot: SlotId,
    },
    /// Active track reached natural end; UI advances to next queue item.
    TrackEnd {
        slot: SlotId,
    },
    /// Crossfade transition completed; standby slot is now active.
    TransitionComplete {
        active_slot: SlotId,
    },
    Xrun {
        count: u64,
    },
    DeviceError {
        message: String,
    },
    /// Monotonic 4Hz telemetry broadcast while playing.
    Heartbeat {
        active_slot: SlotId,
        position_secs: f64,
        duration_secs: f64,
        wallclock_ms: u64,
        is_playing: bool,
    },
}

/// Correlated response to a command sent over stdout.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DaemonResponse {
    pub id: u64,
    #[serde(flatten)]
    pub result: DaemonResult,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum DaemonResult {
    Ok {
        #[serde(skip_serializing_if = "Option::is_none")]
        data: Option<serde_json::Value>,
    },
    Error {
        message: String,
    },
}

impl DaemonResponse {
    pub fn ok(id: u64, data: Option<serde_json::Value>) -> Self {
        Self {
            id,
            result: DaemonResult::Ok { data },
        }
    }

    pub fn error<S: Into<String>>(id: u64, message: S) -> Self {
        Self {
            id,
            result: DaemonResult::Error {
                message: message.into(),
            },
        }
    }
}
