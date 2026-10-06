//! Canonical JSON-Lines daemon protocol for the Nora audio engine.
//!
//! Single source of truth shared by `engine-cli` (daemon) and
//! `engine-testkit` (harness). The TypeScript union in
//! `src/common/audioEngineProtocol.ts` mirrors these wire tags by hand;
//! `schema_tag_lock` below pins every `cmd`/`event` string so a rename here
//! fails loudly instead of silently desyncing the Electron side.

/// Canonical sink vocabulary shared across engine daemon, protocol, and test verifiers.
pub const SINK_TYPE_CPAL_HARDWARE: &str = "cpal_hardware";
pub const SINK_TYPE_DUMMY_PACED_CLOCK: &str = "dummy_paced_clock";
pub const SINK_TYPE_NULL: &str = "null";
pub const SINK_TYPE_WAV: &str = "wav";
pub const SINK_TYPE_UNKNOWN: &str = "unknown";

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

/// Sound profile selection for output presentation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SoundProfile {
    #[default]
    StudioReference,
    VocalNuanceBoost,
}

/// Transition lifecycle state for sound profile changes.
///
/// Note on semantics:
/// - `Active`: Indicates the target profile is committed and authoritative. On synchronous
///   `SoundProfileChanged` events emitted upon command receipt, `Active` confirms that the
///   requested profile has been accepted and committed by the daemon control layer, while the
///   audio thread executes a 30ms smooth cosine-squared ramp (`transition_ms: 30`).
/// - `Transitioning`: Dynamically reported by `GetState` while the real-time audio thread is
///   actively interpolating between curves across the 30ms transition window. Once the ramp
///   completes, `GetState` returns to reporting `Active`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SoundProfileStatus {
    Active,
    Transitioning,
}

/// Generate a unique process-epoch identifier mixing process ID and system time.
pub fn generate_boot_id() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let time_part = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let pid = std::process::id() as u128;
    let mut x = (time_part ^ (pid << 48)) as u64;
    x = x.wrapping_mul(0x517cc1b727220a95);
    x ^= x >> 32;
    x.max(1)
}

/// Inbound command envelope with explicit correlation ID.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DaemonRequest {
    pub id: u64,
    #[serde(flatten)]
    pub command: DaemonCommand,
}

/// 14-Command Schema for daemon control over stdin.
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
    SetSoundProfile {
        profile: SoundProfile,
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
    /// Startup handshake verifying pipe readiness, protocol compatibility, and process epoch.
    Ready {
        protocol_version: u32,
        engine_version: String,
        boot_id: u64,
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
    /// Sound profile state change notification with monotonic sequence epoch.
    SoundProfileChanged {
        profile: SoundProfile,
        status: SoundProfileStatus,
        boot_id: u64,
        sequence_id: u64,
    },
    /// Monotonic 4Hz telemetry broadcast while playing.
    Heartbeat {
        active_slot: SlotId,
        position_secs: f64,
        duration_secs: f64,
        wallclock_ms: u64,
        is_playing: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        sink_type: Option<String>,
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

#[cfg(test)]
mod schema_tag_lock {
    //! Wire-tag lock: every `cmd` / `event` string here MUST match
    //! `src/common/audioEngineProtocol.ts`. A rename that breaks Electron
    //! parity fails this test instead of shipping silent desync.

    use super::*;

    fn cmd_tag(cmd: &DaemonCommand) -> String {
        serde_json::to_value(cmd)
            .unwrap()
            .get("cmd")
            .and_then(|v| v.as_str())
            .unwrap()
            .to_string()
    }

    fn event_tag(ev: &DaemonEvent) -> String {
        serde_json::to_value(ev)
            .unwrap()
            .get("event")
            .and_then(|v| v.as_str())
            .unwrap()
            .to_string()
    }

    #[test]
    fn all_14_command_tags_pinned() {
        let cmds = [
            (
                DaemonCommand::Load {
                    slot: SlotId::A,
                    path: String::new(),
                },
                "load",
            ),
            (
                DaemonCommand::Preload {
                    path: String::new(),
                },
                "preload",
            ),
            (DaemonCommand::Play, "play"),
            (DaemonCommand::Pause, "pause"),
            (DaemonCommand::Stop, "stop"),
            (DaemonCommand::Seek { position_secs: 0.0 }, "seek"),
            (DaemonCommand::Crossfade { duration_ms: 0 }, "crossfade"),
            (DaemonCommand::SetVolume { volume: 0.0 }, "set_volume"),
            (DaemonCommand::SetEq { gains: [0.0; 10] }, "set_eq"),
            (
                DaemonCommand::SetDsp {
                    bypass: false,
                    rg_db: 0.0,
                    karaoke: false,
                    limiter: true,
                },
                "set_dsp",
            ),
            (
                DaemonCommand::SetSoundProfile {
                    profile: SoundProfile::StudioReference,
                },
                "set_sound_profile",
            ),
            (DaemonCommand::ListDevices, "list_devices"),
            (
                DaemonCommand::SetDevice {
                    device_id: String::new(),
                },
                "set_device",
            ),
            (DaemonCommand::GetState, "get_state"),
        ];
        assert_eq!(cmds.len(), 14);
        for (cmd, expected) in cmds {
            assert_eq!(cmd_tag(&cmd), expected);
        }
        // Field names the TS side reads off correlated responses.
        let load = serde_json::to_value(DaemonCommand::Load {
            slot: SlotId::B,
            path: "x".to_string(),
        })
        .unwrap();
        assert_eq!(load.get("slot").and_then(|v| v.as_str()), Some("b"));
    }

    #[test]
    fn all_9_event_tags_pinned() {
        let evs = [
            (
                DaemonEvent::Ready {
                    protocol_version: 1,
                    engine_version: String::new(),
                    boot_id: 1,
                },
                "ready",
            ),
            (
                DaemonEvent::StateChanged {
                    state: PlaybackState::Playing,
                    position_secs: None,
                },
                "state_changed",
            ),
            (DaemonEvent::SlotEnd { slot: SlotId::A }, "slot_end"),
            (DaemonEvent::TrackEnd { slot: SlotId::A }, "track_end"),
            (
                DaemonEvent::TransitionComplete {
                    active_slot: SlotId::B,
                },
                "transition_complete",
            ),
            (DaemonEvent::Xrun { count: 0 }, "xrun"),
            (
                DaemonEvent::DeviceError {
                    message: String::new(),
                },
                "device_error",
            ),
            (
                DaemonEvent::SoundProfileChanged {
                    profile: SoundProfile::StudioReference,
                    status: SoundProfileStatus::Active,
                    boot_id: 1,
                    sequence_id: 1,
                },
                "sound_profile_changed",
            ),
            (
                DaemonEvent::Heartbeat {
                    active_slot: SlotId::A,
                    position_secs: 0.0,
                    duration_secs: 0.0,
                    wallclock_ms: 0,
                    is_playing: true,
                    sink_type: None,
                },
                "heartbeat",
            ),
        ];
        assert_eq!(evs.len(), 9);
        for (ev, expected) in evs {
            assert_eq!(event_tag(&ev), expected);
        }
    }

    #[test]
    fn request_response_envelope_roundtrip() {
        let req = DaemonRequest {
            id: 42,
            command: DaemonCommand::Play,
        };
        let line = serde_json::to_string(&req).unwrap();
        let back: DaemonRequest = serde_json::from_str(&line).unwrap();
        assert_eq!(back, req);

        let resp = DaemonResponse::error(u64::MAX, "boom");
        let line = serde_json::to_string(&resp).unwrap();
        let back: DaemonResponse = serde_json::from_str(&line).unwrap();
        assert_eq!(back, resp);
    }

    /// Shape lock against the checked-in wire examples: any field rename,
    /// type change, or optional-vs-required drift on either side fails here
    /// (Rust exact-match) and in test/unit/audioEngineWireParity.test.ts
    /// (TypeScript parse check) instead of desyncing silently.
    #[test]
    fn wire_examples_match_schema_exactly() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("wire-examples.json");
        let raw = std::fs::read_to_string(&dir).expect("wire-examples.json");
        let doc: serde_json::Value = serde_json::from_str(&raw).unwrap();

        for req in doc["commands"].as_array().unwrap() {
            let parsed: DaemonRequest =
                serde_json::from_value(req.clone()).expect("command example must parse");
            let roundtrip = serde_json::to_value(&parsed).unwrap();
            assert_eq!(&roundtrip, req, "command wire shape drifted: {req}");
        }
        for ev in doc["events"].as_array().unwrap() {
            let parsed: DaemonEvent =
                serde_json::from_value(ev.clone()).expect("event example must parse");
            let roundtrip = serde_json::to_value(&parsed).unwrap();
            assert_eq!(&roundtrip, ev, "event wire shape drifted: {ev}");
        }
        for resp in doc["responses"].as_array().unwrap() {
            let parsed: DaemonResponse =
                serde_json::from_value(resp.clone()).expect("response example must parse");
            let roundtrip = serde_json::to_value(&parsed).unwrap();
            assert_eq!(&roundtrip, resp, "response wire shape drifted: {resp}");
        }
        assert_eq!(doc["commands"].as_array().unwrap().len(), 14);
        assert_eq!(doc["events"].as_array().unwrap().len(), 10);
    }
}
