//! JSON-Lines Daemon Protocol Mock & Schema Validator.
//!
//! Provides schema models, serializes commands, and validates push events
//! according to R3 Daemon Protocol specifications.

use serde::{Deserialize, Serialize};

/// 13-Command Schema defined in R3 / PROJECT.md
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SlotId {
    A,
    B,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlaybackState {
    Playing,
    Paused,
    Stopped,
}

/// 5-Push-Event Schema defined in R3 / PROJECT.md
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

/// Daemon response envelope for synchronous command confirmations or errors.
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

/// Protocol testing harness for encoding commands and decoding responses/events.
pub struct ProtocolHarness;

impl ProtocolHarness {
    /// Serialize a daemon command into a newline-terminated JSON string.
    pub fn serialize_command(cmd: &DaemonCommand) -> Result<String, serde_json::Error> {
        let mut json = serde_json::to_string(cmd)?;
        json.push('\n');
        Ok(json)
    }

    /// Parse a single line received from daemon stdout into either an event or a response.
    pub fn parse_event(line: &str) -> Result<DaemonEvent, serde_json::Error> {
        serde_json::from_str(line.trim())
    }

    /// Parse a command response.
    pub fn parse_response(line: &str) -> Result<DaemonResponse, serde_json::Error> {
        serde_json::from_str(line.trim())
    }

    /// Validate that a raw JSON string adheres strictly to the 5-event schema.
    pub fn validate_raw_event(json_str: &str) -> Result<DaemonEvent, String> {
        serde_json::from_str::<DaemonEvent>(json_str.trim())
            .map_err(|e| format!("Schema validation error: {e} for json: {json_str}"))
    }
}
