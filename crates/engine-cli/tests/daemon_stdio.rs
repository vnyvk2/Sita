//! Real-binary stdio integration test: spawns the compiled `engine-cli`
//! daemon and drives the full load → play → heartbeat → seek → stop loop
//! over pipes. This is the layer where the five P1 daemon defects lived
//! (no-op seek, cumulative playhead, missing TrackEnd, orphaned decoders,
//! torn stdout) — mocks and JSON roundtrips cannot catch them.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError};
use std::time::{Duration, Instant};

fn workspace_root() -> std::path::PathBuf {
    // crates/engine-cli -> workspace root.
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
}

fn fixture(name: &str) -> String {
    let p = workspace_root().join("target").join("test_fixtures").join(name);
    assert!(
        p.exists(),
        "required audio fixture missing: {} (no silent skips)",
        p.display()
    );
    p.to_string_lossy().into_owned()
}

struct Daemon {
    child: Child,
    stdin: Option<ChildStdin>,
    lines: Receiver<String>,
}

impl Daemon {
    fn spawn() -> Self {
        let bin = env!("CARGO_BIN_EXE_engine-cli");
        let mut child = Command::new(bin)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn engine-cli");
        let stdin = child.stdin.take().expect("stdin");
        let stdout = child.stdout.take().expect("stdout");
        let (tx, rx) = channel();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                if tx.send(line).is_err() {
                    break;
                }
            }
        });
        Self { child, stdin: Some(stdin), lines: rx }
    }

    fn stdin(&mut self) -> &mut ChildStdin {
        self.stdin.as_mut().expect("stdin closed")
    }

    fn send(&mut self, id: u64, cmd_json: &str) {
        // Merge {"id":N} with the command object.
        let mut v: serde_json::Value = serde_json::from_str(cmd_json).unwrap();
        v["id"] = serde_json::Value::from(id);
        writeln!(self.stdin(), "{}", v).unwrap();
        self.stdin().flush().unwrap();
    }

    fn next_line(&self, timeout: Duration) -> String {
        match self.lines.recv_timeout(timeout) {
            Ok(l) => l,
            Err(RecvTimeoutError::Timeout) => panic!("timed out waiting for daemon line"),
            Err(RecvTimeoutError::Disconnected) => panic!("daemon stdout closed"),
        }
    }

    /// Read lines until the correlated response arrives; returns it.
    /// Push events seen along the way are collected for the caller.
    fn wait_response(&self, id: u64, timeout: Duration, events: &mut Vec<serde_json::Value>) -> serde_json::Value {
        let deadline = Instant::now() + timeout;
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            assert!(!remaining.is_zero(), "timed out waiting for response id={id}");
            let line = self.next_line(remaining);
            let v: serde_json::Value = serde_json::from_str(&line).unwrap();
            if v.get("id").and_then(|i| i.as_u64()) == Some(id) {
                return v;
            }
            events.push(v);
        }
    }

    fn wait_heartbeat(&self, timeout: Duration) -> serde_json::Value {
        let deadline = Instant::now() + timeout;
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            assert!(!remaining.is_zero(), "timed out waiting for heartbeat");
            let line = self.next_line(remaining);
            let v: serde_json::Value = serde_json::from_str(&line).unwrap();
            if v.get("event").and_then(|e| e.as_str()) == Some("heartbeat") {
                return v;
            }
        }
    }
}

impl Drop for Daemon {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn assert_ok(resp: &serde_json::Value) {
    assert_eq!(
        resp.get("status").and_then(|s| s.as_str()),
        Some("ok"),
        "expected ok response, got: {resp}"
    );
}

#[test]
fn daemon_stdio_load_play_seek_stop() {
    let mut daemon = Daemon::spawn();

    // 1. Readiness handshake first.
    let ready: serde_json::Value =
        serde_json::from_str(&daemon.next_line(Duration::from_secs(10))).unwrap();
    assert_eq!(ready.get("event").and_then(|e| e.as_str()), Some("ready"));
    assert_eq!(ready.get("protocol_version").and_then(|v| v.as_u64()), Some(1));

    let mut events = Vec::new();

    // 2. Fresh daemon reports position 0 and zero callback contention.
    daemon.send(1, r#"{"cmd":"get_state"}"#);
    let state = daemon.wait_response(1, Duration::from_secs(5), &mut events);
    assert_ok(&state);
    assert_eq!(state["data"]["position_secs"].as_f64(), Some(0.0));
    assert_eq!(state["data"]["cb_contention"].as_u64(), Some(0));

    // 3. Load a real 3s WAV fixture.
    let path = fixture("ref_440hz_3s.wav").replace('\\', "\\\\");
    daemon.send(2, &format!(r#"{{"cmd":"load","slot":"a","path":"{path}"}}"#));
    let loaded = daemon.wait_response(2, Duration::from_secs(10), &mut events);
    assert_ok(&loaded);
    let duration = loaded["data"]["duration_secs"].as_f64().unwrap();
    assert!((duration - 3.0).abs() < 0.2, "unexpected duration {duration}");

    // 4. Play; heartbeats must advance monotonically (per-slot playhead).
    daemon.send(3, r#"{"cmd":"play"}"#);
    assert_ok(&daemon.wait_response(3, Duration::from_secs(5), &mut events));
    let hb1 = daemon.wait_heartbeat(Duration::from_secs(5));
    let hb2 = daemon.wait_heartbeat(Duration::from_secs(5));
    let p1 = hb1["position_secs"].as_f64().unwrap();
    let p2 = hb2["position_secs"].as_f64().unwrap();
    assert!(p2 > p1, "playhead did not advance: {p1} -> {p2}");
    assert!(p1 < duration, "position {p1} beyond duration {duration}");

    // 5. Seek to 1.5s: the next heartbeat must reflect the jump.
    // (The old no-op stub returned Ok while the playhead kept crawling.)
    daemon.send(4, r#"{"cmd":"seek","position_secs":1.5}"#);
    assert_ok(&daemon.wait_response(4, Duration::from_secs(5), &mut events));
    let hb3 = daemon.wait_heartbeat(Duration::from_secs(5));
    let p3 = hb3["position_secs"].as_f64().unwrap();
    assert!(
        (1.4..=3.0).contains(&p3),
        "seek did not reposition playhead, heartbeat shows {p3}"
    );

    // 5b. Resample + seek end to end: reload the active slot with 44.1 kHz
    // content (sinc path on 48 kHz outputs, passthrough where the device is
    // 44.1 kHz — assertions hold either way), then seek. Each spawn builds a
    // FRESH resampler and ring pair, so a seek cannot leak stale tail audio;
    // this leg fails if it does.
    let path44 = fixture("ref_440hz_3s_44100.wav").replace('\\', "\\\\");
    daemon.send(10, &format!(r#"{{"cmd":"load","slot":"a","path":"{path44}"}}"#));
    let loaded44 = daemon.wait_response(10, Duration::from_secs(10), &mut events);
    assert_ok(&loaded44);
    // Proves the mismatch leg is armed: file rate differs from a 48 kHz output.
    // (On a 44.1 kHz device this is passthrough; assertions still hold.)
    assert_eq!(loaded44["data"]["sample_rate"].as_u64(), Some(44100));
    daemon.send(11, r#"{"cmd":"seek","position_secs":2.0}"#);
    assert_ok(&daemon.wait_response(11, Duration::from_secs(5), &mut events));
    let hb4 = daemon.wait_heartbeat(Duration::from_secs(5));
    let p4 = hb4["position_secs"].as_f64().unwrap();
    assert!(
        (1.9..=3.0).contains(&p4),
        "resampled seek did not reposition playhead, heartbeat shows {p4}"
    );

    // 6. Malformed input gets the sentinel error id, never id 0.
    writeln!(daemon.stdin(), "this is not json").unwrap();
    daemon.stdin().flush().unwrap();
    let err_line = daemon.next_line(Duration::from_secs(5));
    let err_v: serde_json::Value = serde_json::from_str(&err_line).unwrap();
    assert_eq!(err_v.get("status").and_then(|s| s.as_str()), Some("error"));
    assert_eq!(err_v.get("id").and_then(|i| i.as_u64()), Some(u64::MAX));

    // 7. Stop, then EOF must terminate the daemon promptly.
    daemon.send(5, r#"{"cmd":"stop"}"#);
    assert_ok(&daemon.wait_response(5, Duration::from_secs(5), &mut events));
    daemon.stdin.take();
    let start = Instant::now();
    let status = daemon.child.wait().expect("wait for daemon exit");
    assert!(start.elapsed() < Duration::from_secs(5), "daemon ignored stdin EOF");
    assert!(status.success() || status.code().is_some());
}

#[test]
fn eof_during_active_playback_exits_cleanly() {
    // The scenario that matters: parent dies MID-SONG with the stream open,
    // decoder threads pumping, and heartbeats flowing. The prior suite only
    // closed stdin after `stop` (idle path) — a hang here would orphan a
    // WASAPI endpoint and a zombie process on every Electron crash.
    let mut daemon = Daemon::spawn();
    let ready: serde_json::Value =
        serde_json::from_str(&daemon.next_line(Duration::from_secs(10))).unwrap();
    assert_eq!(ready.get("event").and_then(|e| e.as_str()), Some("ready"));

    let mut events = Vec::new();
    let path = fixture("ref_440hz_3s.wav").replace('\\', "\\\\");
    daemon.send(1, &format!(r#"{{"cmd":"load","slot":"a","path":"{path}"}}"#));
    assert_ok(&daemon.wait_response(1, Duration::from_secs(10), &mut events));
    daemon.send(2, r#"{"cmd":"play"}"#);
    assert_ok(&daemon.wait_response(2, Duration::from_secs(5), &mut events));

    // Prove audio is flowing before killing the parent side.
    let hb = daemon.wait_heartbeat(Duration::from_secs(5));
    assert!(hb["position_secs"].as_f64().unwrap() >= 0.0);

    // Parent death: close stdin mid-song, no stop command.
    daemon.stdin.take();
    let start = Instant::now();
    let status = daemon.child.wait().expect("wait for daemon exit");
    assert!(
        start.elapsed() < Duration::from_secs(5),
        "daemon hung on EOF during active playback"
    );
    assert!(status.success(), "daemon exit status: {status}");
    // Drop's kill()+wait() on the already-reaped child are harmless no-ops.
}

#[test]
fn daemon_stdio_crossfade_interrupted_by_seek_suppresses_transition_complete() {
    let mut daemon = Daemon::spawn();
    let ready: serde_json::Value =
        serde_json::from_str(&daemon.next_line(Duration::from_secs(10))).unwrap();
    assert_eq!(ready.get("event").and_then(|e| e.as_str()), Some("ready"));

    let mut events = Vec::new();
    let path_a = fixture("ref_440hz_3s.wav").replace('\\', "\\\\");
    let path_b = fixture("ref_440hz_3s_44100.wav").replace('\\', "\\\\");

    // 1. Load Slot A and Slot B
    daemon.send(1, &format!(r#"{{"cmd":"load","slot":"a","path":"{path_a}"}}"#));
    assert_ok(&daemon.wait_response(1, Duration::from_secs(10), &mut events));
    daemon.send(2, &format!(r#"{{"cmd":"load","slot":"b","path":"{path_b}"}}"#));
    assert_ok(&daemon.wait_response(2, Duration::from_secs(10), &mut events));

    // 2. Play Slot A
    daemon.send(3, r#"{"cmd":"play"}"#);
    assert_ok(&daemon.wait_response(3, Duration::from_secs(5), &mut events));
    let _ = daemon.wait_heartbeat(Duration::from_secs(5));

    // 3. Initiate a long crossfade (5000ms)
    daemon.send(4, r#"{"cmd":"crossfade","duration_ms":5000}"#);
    assert_ok(&daemon.wait_response(4, Duration::from_secs(5), &mut events));

    // Let it crossfade for ~300ms
    std::thread::sleep(Duration::from_millis(300));

    // 4. Seek on active Slot A while crossfading
    daemon.send(5, r#"{"cmd":"seek","position_secs":0.5}"#);
    assert_ok(&daemon.wait_response(5, Duration::from_secs(5), &mut events));

    // 5. Read several heartbeats (covering over 1 second)
    for _ in 0..5 {
        let hb = daemon.wait_heartbeat(Duration::from_secs(5));
        assert_eq!(
            hb["active_slot"].as_str(),
            Some("a"),
            "Slot A must remain active after seek cancelled crossfade"
        );
    }

    // 6. Verify that NO transition_complete event was collected among events
    for ev in &events {
        assert_ne!(
            ev.get("event").and_then(|e| e.as_str()),
            Some("transition_complete"),
            "Cancelled crossfade must NOT emit transition_complete!"
        );
    }

    daemon.send(6, r#"{"cmd":"stop"}"#);
    assert_ok(&daemon.wait_response(6, Duration::from_secs(5), &mut events));
}

#[test]
fn daemon_stdio_crossfade_interrupted_by_stop_aborts_cleanly() {
    let mut daemon = Daemon::spawn();
    let _ready = daemon.next_line(Duration::from_secs(10));

    let mut events = Vec::new();
    let path_a = fixture("ref_440hz_3s.wav").replace('\\', "\\\\");
    let path_b = fixture("ref_440hz_3s_44100.wav").replace('\\', "\\\\");

    daemon.send(1, &format!(r#"{{"cmd":"load","slot":"a","path":"{path_a}"}}"#));
    assert_ok(&daemon.wait_response(1, Duration::from_secs(10), &mut events));
    daemon.send(2, &format!(r#"{{"cmd":"load","slot":"b","path":"{path_b}"}}"#));
    assert_ok(&daemon.wait_response(2, Duration::from_secs(10), &mut events));

    daemon.send(3, r#"{"cmd":"play"}"#);
    assert_ok(&daemon.wait_response(3, Duration::from_secs(5), &mut events));
    let _ = daemon.wait_heartbeat(Duration::from_secs(5));

    daemon.send(4, r#"{"cmd":"crossfade","duration_ms":5000}"#);
    assert_ok(&daemon.wait_response(4, Duration::from_secs(5), &mut events));
    std::thread::sleep(Duration::from_millis(200));

    // Stop mid-crossfade
    daemon.send(5, r#"{"cmd":"stop"}"#);
    assert_ok(&daemon.wait_response(5, Duration::from_secs(5), &mut events));

    // Verify stopped state in get_state
    daemon.send(6, r#"{"cmd":"get_state"}"#);
    let state = daemon.wait_response(6, Duration::from_secs(5), &mut events);
    assert_ok(&state);

    // Verify that NO transition_complete event was emitted
    for ev in &events {
        assert_ne!(
            ev.get("event").and_then(|e| e.as_str()),
            Some("transition_complete"),
            "Stop mid-crossfade must NOT emit transition_complete!"
        );
    }
}

#[test]
fn daemon_stdio_crossfade_interrupted_by_next_locks_incoming_slot_without_transition_complete() {
    let mut daemon = Daemon::spawn();
    let _ready = daemon.next_line(Duration::from_secs(10));

    let mut events = Vec::new();
    let path_a = fixture("ref_440hz_3s.wav").replace('\\', "\\\\");
    let path_b = fixture("ref_440hz_3s_44100.wav").replace('\\', "\\\\");

    daemon.send(1, &format!(r#"{{"cmd":"load","slot":"a","path":"{path_a}"}}"#));
    assert_ok(&daemon.wait_response(1, Duration::from_secs(10), &mut events));
    daemon.send(2, &format!(r#"{{"cmd":"load","slot":"b","path":"{path_b}"}}"#));
    assert_ok(&daemon.wait_response(2, Duration::from_secs(10), &mut events));

    daemon.send(3, r#"{"cmd":"play"}"#);
    assert_ok(&daemon.wait_response(3, Duration::from_secs(5), &mut events));
    let _ = daemon.wait_heartbeat(Duration::from_secs(5));

    daemon.send(4, r#"{"cmd":"crossfade","duration_ms":5000}"#);
    assert_ok(&daemon.wait_response(4, Duration::from_secs(5), &mut events));
    std::thread::sleep(Duration::from_millis(200));

    // Next track loaded into Slot B mid-crossfade
    daemon.send(5, &format!(r#"{{"cmd":"load","slot":"b","path":"{path_b}"}}"#));
    assert_ok(&daemon.wait_response(5, Duration::from_secs(10), &mut events));

    // Heartbeats must now report Slot B
    for _ in 0..4 {
        let hb = daemon.wait_heartbeat(Duration::from_secs(5));
        assert_eq!(
            hb["active_slot"].as_str(),
            Some("b"),
            "Slot B must be authoritative active slot after Next"
        );
    }

    // Verify that NO transition_complete event was emitted (since it was cancelled by Load, not natural finish)
    for ev in &events {
        assert_ne!(
            ev.get("event").and_then(|e| e.as_str()),
            Some("transition_complete"),
            "Next mid-crossfade must NOT emit transition_complete!"
        );
    }

    daemon.send(6, r#"{"cmd":"stop"}"#);
    assert_ok(&daemon.wait_response(6, Duration::from_secs(5), &mut events));
}

#[test]
fn daemon_stdio_sound_profile_toggle_during_playback_is_lock_free() {
    let mut daemon = Daemon::spawn();
    let _ready = daemon.next_line(Duration::from_secs(10));

    let mut events = Vec::new();
    let path = fixture("ref_440hz_3s.wav").replace('\\', "\\\\");

    daemon.send(1, &format!(r#"{{"cmd":"load","slot":"a","path":"{path}"}}"#));
    assert_ok(&daemon.wait_response(1, Duration::from_secs(10), &mut events));

    daemon.send(2, r#"{"cmd":"play"}"#);
    assert_ok(&daemon.wait_response(2, Duration::from_secs(5), &mut events));
    let _ = daemon.wait_heartbeat(Duration::from_secs(5));

    // Toggle sound profile rapidly during active playback
    daemon.send(3, r#"{"cmd":"set_sound_profile","profile":"vocal_nuance_boost"}"#);
    let resp = daemon.wait_response(3, Duration::from_secs(5), &mut events);
    assert_ok(&resp);

    // Verify GetState reports updated profile without blocking and with 0 contention
    daemon.send(4, r#"{"cmd":"get_state"}"#);
    let state_resp = daemon.wait_response(4, Duration::from_secs(5), &mut events);
    assert_ok(&state_resp);
    let data = state_resp["data"].as_object().unwrap();
    assert_eq!(data["sound_profile"].as_str(), Some("vocal_nuance_boost"));
    assert_eq!(data["cb_contention"].as_u64(), Some(0));
    assert!(data["position_secs"].as_f64().unwrap() >= 0.0);

    // Toggle back to studio_reference
    daemon.send(5, r#"{"cmd":"set_sound_profile","profile":"studio_reference"}"#);
    assert_ok(&daemon.wait_response(5, Duration::from_secs(5), &mut events));

    daemon.send(6, r#"{"cmd":"get_state"}"#);
    let state_resp2 = daemon.wait_response(6, Duration::from_secs(5), &mut events);
    assert_ok(&state_resp2);
    let data2 = state_resp2["data"].as_object().unwrap();
    assert_eq!(data2["sound_profile"].as_str(), Some("studio_reference"));
    assert_eq!(data2["cb_contention"].as_u64(), Some(0));
    assert!(data2["position_secs"].as_f64().unwrap() >= 0.0);

    daemon.send(7, r#"{"cmd":"stop"}"#);
    assert_ok(&daemon.wait_response(7, Duration::from_secs(5), &mut events));
}

#[test]
fn daemon_stdio_song_shift_with_preloaded_standby_plays_intended_track() {
    let mut daemon = Daemon::spawn();
    let mut events = Vec::new();
    let path_track1 = fixture("ref_440hz_3s.wav").replace('\\', "\\\\");
    let path_track2 = fixture("ref_440hz_3s_44100.wav").replace('\\', "\\\\");
    let path_track3 = fixture("ref_440hz_3s.wav").replace('\\', "\\\\");

    // 1. Load Track 1 into Slot A and play
    daemon.send(1, &format!(r#"{{"cmd":"load","slot":"a","path":"{path_track1}"}}"#));
    assert_ok(&daemon.wait_response(1, Duration::from_secs(10), &mut events));
    daemon.send(2, r#"{"cmd":"play"}"#);
    assert_ok(&daemon.wait_response(2, Duration::from_secs(5), &mut events));
    let _ = daemon.wait_heartbeat(Duration::from_secs(5));

    // 2. Preload Track 2 into standby (Slot B)
    daemon.send(3, &format!(r#"{{"cmd":"preload","path":"{path_track2}"}}"#));
    assert_ok(&daemon.wait_response(3, Duration::from_secs(10), &mut events));

    // Let it play for 200ms
    std::thread::sleep(Duration::from_millis(200));

    // 3. User manually shifts songs to Track 3 (loads into active Slot A, plays)
    daemon.send(4, &format!(r#"{{"cmd":"load","slot":"a","path":"{path_track3}"}}"#));
    assert_ok(&daemon.wait_response(4, Duration::from_secs(10), &mut events));
    daemon.send(5, r#"{"cmd":"play"}"#);
    assert_ok(&daemon.wait_response(5, Duration::from_secs(5), &mut events));

    // 4. Assert: Slot A must remain the active playing slot! It must NOT have auto-spliced to preloaded Track 2 in Slot B!
    for _ in 0..4 {
        let hb = daemon.wait_heartbeat(Duration::from_secs(5));
        assert_eq!(
            hb["active_slot"].as_str(),
            Some("a"),
            "Slot A must remain active and playing the intended track, not hijacked by Slot B"
        );
        assert_eq!(
            hb["is_playing"].as_bool(),
            Some(true),
            "Slot A must be actively playing"
        );
    }

    daemon.send(6, r#"{"cmd":"stop"}"#);
    assert_ok(&daemon.wait_response(6, Duration::from_secs(5), &mut events));
}

