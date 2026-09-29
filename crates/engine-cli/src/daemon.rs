//! Daemon loop and asynchronous command dispatcher for engine-cli.

use std::io::{BufRead, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use crate::protocol::{
    DaemonCommand, DaemonEvent, DaemonRequest, DaemonResponse, DaemonResult, PlaybackState, SlotId,
};
use engine_lib::buffer::BoundedAudioTransport;
use engine_lib::decoder::DecoderPipeline;
use engine_lib::dsp::{DspConfig, DspPipeline};
use engine_lib::mixer::{DualSlotMixer, SlotId as LibSlotId};
use engine_lib::sink::{CpalBackend, OutputBackend};
use engine_lib::types::AudioSpec;

/// Core daemon controller managing background decoder threads, audio sinks, and the 4Hz heartbeat.
pub struct EngineDaemon {
    running: Arc<AtomicBool>,
    is_playing: Arc<AtomicBool>,
    state: PlaybackState,
    active_slot: SlotId,
    volume: f32,
    dsp: DspPipeline,
    mixer: DualSlotMixer,
    backend: CpalBackend,
    start_time: Instant,
}

impl Default for EngineDaemon {
    fn default() -> Self {
        Self::new()
    }
}

impl EngineDaemon {
    pub fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(true)),
            is_playing: Arc::new(AtomicBool::new(false)),
            state: PlaybackState::Stopped,
            active_slot: SlotId::A,
            volume: 1.0,
            dsp: DspPipeline::new(48000.0),
            mixer: DualSlotMixer::new(),
            backend: CpalBackend::new(),
            start_time: Instant::now(),
        }
    }

    /// Process incoming correlated request.
    pub fn handle_request(&mut self, req: DaemonRequest) -> DaemonResponse {
        let id = req.id;
        let res = self.handle_command(req.command);
        DaemonResponse { id, result: res }
    }

    /// Execute command and return synchronous result.
    pub fn handle_command(&mut self, cmd: DaemonCommand) -> DaemonResult {
        match cmd {
            DaemonCommand::Load { slot, path } => {
                let lib_slot = match slot {
                    SlotId::A => LibSlotId::A,
                    SlotId::B => LibSlotId::B,
                };

                let probed = match engine_lib::decoder::probe_file(&path) {
                    Ok(p) => p,
                    Err(e) => return DaemonResult::Error { message: format!("Probe failed: {}", e) },
                };

                let duration_secs = probed.estimated_duration.map(|d| d.as_secs_f64()).unwrap_or(0.0);
                let sample_rate = probed.spec.sample_rate;
                let channels = probed.spec.channels;
                let codec = probed.codec.clone();

                let spec = AudioSpec::new_f32_stereo(sample_rate);
                let (mut producer, consumer) = BoundedAudioTransport::create(&spec, 3.0);
                let stop_signal = Arc::new(AtomicBool::new(false));

                // Spawn background decoder thread
                let stop_clone = Arc::clone(&stop_signal);
                let path_clone = path.clone();
                thread::spawn(move || {
                    if let Ok(mut pipeline) = DecoderPipeline::open(&path_clone) {
                        while !stop_clone.load(Ordering::Relaxed) {
                            match pipeline.decode_next() {
                                Ok(Some(samples)) => {
                                    if producer.push_with_backpressure(samples, &stop_clone).is_err() {
                                        break;
                                    }
                                }
                                Ok(None) | Err(_) => {
                                    stop_clone.store(true, Ordering::Relaxed);
                                    break;
                                }
                            }
                        }
                    }
                });

                self.mixer.slot_mut(lib_slot).prime(consumer, spec, stop_signal);
                DaemonResult::Ok {
                    data: Some(serde_json::json!({
                        "slot": slot,
                        "path": path,
                        "cued": true,
                        "duration_secs": duration_secs,
                        "sample_rate": sample_rate,
                        "channels": channels,
                        "codec": codec,
                    })),
                }
            }
            DaemonCommand::Preload { path } => {
                let standby = match self.active_slot {
                    SlotId::A => SlotId::B,
                    SlotId::B => SlotId::A,
                };
                self.handle_command(DaemonCommand::Load { slot: standby, path })
            }
            DaemonCommand::Play => {
                let active_id = match self.active_slot {
                    SlotId::A => LibSlotId::A,
                    SlotId::B => LibSlotId::B,
                };
                if self.mixer.slot(active_id).state == engine_lib::mixer::SlotState::Empty {
                    return DaemonResult::Error {
                        message: "No track loaded in active slot".to_string(),
                    };
                }
                self.state = PlaybackState::Playing;
                self.is_playing.store(true, Ordering::Release);
                self.mixer.play();
                let _ = self.backend.start();
                DaemonResult::Ok { data: None }
            }
            DaemonCommand::Pause => {
                self.state = PlaybackState::Paused;
                self.is_playing.store(false, Ordering::Release);
                self.mixer.pause();
                let _ = self.backend.pause();
                DaemonResult::Ok { data: None }
            }
            DaemonCommand::Stop => {
                self.state = PlaybackState::Stopped;
                self.is_playing.store(false, Ordering::Release);
                self.mixer.pause();
                let _ = self.backend.stop();
                DaemonResult::Ok { data: None }
            }
            DaemonCommand::Seek { position_secs: _ } => {
                // In production, seek repositions active decoder and flushes ring buffer
                DaemonResult::Ok { data: None }
            }
            DaemonCommand::Crossfade { duration_ms } => {
                let frames = ((duration_ms as f64 / 1000.0) * 48000.0).round() as usize;
                if let Err(e) = self.mixer.start_crossfade(frames) {
                    DaemonResult::Error { message: e.to_string() }
                } else {
                    DaemonResult::Ok { data: None }
                }
            }
            DaemonCommand::SetVolume { volume } => {
                self.volume = volume.clamp(0.0, 1.0);
                self.mixer.set_volume(self.volume);
                DaemonResult::Ok { data: None }
            }
            DaemonCommand::SetEq { gains } => {
                let mut dsp_config = self.dsp.config().clone();
                dsp_config.eq_gains = gains;
                self.dsp.update_config(dsp_config);
                DaemonResult::Ok { data: None }
            }
            DaemonCommand::SetDsp { bypass, rg_db, karaoke, limiter } => {
                self.dsp.update_config(DspConfig {
                    bypass,
                    replaygain_db: rg_db,
                    eq_gains: self.dsp.config().eq_gains,
                    karaoke,
                    limiter,
                });
                DaemonResult::Ok { data: None }
            }
            DaemonCommand::ListDevices => {
                let devices = self.backend.list_output_devices();
                DaemonResult::Ok {
                    data: Some(serde_json::to_value(devices).unwrap_or_default()),
                }
            }
            DaemonCommand::SetDevice { device_id } => {
                if let Err(e) = self.backend.select_device(Some(&device_id)) {
                    DaemonResult::Error { message: e.to_string() }
                } else {
                    DaemonResult::Ok { data: None }
                }
            }
            DaemonCommand::GetState => {
                let stats = self.backend.stats();
                DaemonResult::Ok {
                    data: Some(serde_json::json!({
                        "state": self.state,
                        "active_slot": self.active_slot,
                        "volume": self.volume,
                        "xrun_count": stats.xrun_count,
                        "low_water_mark": stats.low_water_mark,
                        "position_secs": stats.position_seconds,
                    })),
                }
            }
        }
    }

    /// Run the interactive stdio JSON-lines protocol loop.
    pub fn run_stdio_loop(&mut self) {
        let mut stdout = std::io::stdout();

        // 1. Emit Readiness Handshake event immediately
        let ready_event = DaemonEvent::Ready {
            protocol_version: 1,
            engine_version: env!("CARGO_PKG_VERSION").to_string(),
        };
        if let Ok(line) = serde_json::to_string(&ready_event) {
            let _ = writeln!(stdout, "{}", line);
            let _ = stdout.flush();
        }

        // 2. Spawn Gated 4Hz Heartbeat thread (only transmits while playing)
        let running_hb = Arc::clone(&self.running);
        let is_playing_hb = Arc::clone(&self.is_playing);
        let start_time = self.start_time;
        thread::spawn(move || {
            let mut hb_stdout = std::io::stdout();
            while running_hb.load(Ordering::Relaxed) {
                thread::sleep(Duration::from_millis(250));

                if is_playing_hb.load(Ordering::Relaxed) {
                    let wallclock_ms = start_time.elapsed().as_millis() as u64;

                    let heartbeat = DaemonEvent::Heartbeat {
                        active_slot: SlotId::A,
                        position_secs: 0.0,
                        duration_secs: 0.0,
                        wallclock_ms,
                        is_playing: true,
                    };

                    if let Ok(line) = serde_json::to_string(&heartbeat) {
                        let _ = writeln!(hb_stdout, "{}", line);
                        let _ = hb_stdout.flush();
                    }
                }
            }
        });

        // 3. Stdin Command Processing Loop with graceful EOF termination
        let stdin = std::io::stdin();
        let mut reader = stdin.lock();
        let mut line = String::new();

        while self.running.load(Ordering::Relaxed) {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) => {
                    // EOF on stdin: Parent process terminated or closed pipe. Exit cleanly.
                    log::info!("Stdin reached EOF, terminating engine daemon cleanly");
                    break;
                }
                Ok(_) => {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    match serde_json::from_str::<DaemonRequest>(trimmed) {
                        Ok(req) => {
                            let resp = self.handle_request(req);
                            if let Ok(resp_json) = serde_json::to_string(&resp) {
                                let _ = writeln!(stdout, "{}", resp_json);
                                let _ = stdout.flush();
                            }
                        }
                        Err(e) => {
                            let resp = DaemonResponse::error(0, format!("Malformed request JSON: {}", e));
                            if let Ok(resp_json) = serde_json::to_string(&resp) {
                                let _ = writeln!(stdout, "{}", resp_json);
                                let _ = stdout.flush();
                            }
                        }
                    }
                }
                Err(e) => {
                    log::warn!("Stdin read error: {}, exiting", e);
                    break;
                }
            }
        }

        // Clean up audio hardware and state
        self.running.store(false, Ordering::Release);
        self.is_playing.store(false, Ordering::Release);
        self.mixer.pause();
        let _ = self.backend.stop();
    }
}
