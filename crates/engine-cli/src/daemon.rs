//! Daemon loop and asynchronous command dispatcher for engine-cli.

use std::io::{BufRead, Write};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use crate::protocol::{
    DaemonCommand, DaemonEvent, DaemonRequest, DaemonResponse, DaemonResult, PlaybackState, SlotId,
};
use engine_lib::buffer::BoundedAudioTransport;
use engine_lib::decoder::DecoderPipeline;
use engine_lib::dsp::{DspConfig, DspPipeline};
use engine_lib::mixer::{DualSlotMixer, SlotId as LibSlotId};
use engine_lib::sink::{AudioSource, CpalBackend, OutputBackend};
use engine_lib::types::{AudioSpec, SinkError};

/// Core daemon controller managing background decoder threads, audio sinks, and the 4Hz heartbeat.
pub struct EngineDaemon {
    running: Arc<AtomicBool>,
    is_playing: Arc<AtomicBool>,
    state: PlaybackState,
    active_slot: Arc<AtomicU8>, // 0 for SlotId::A, 1 for SlotId::B
    volume: f32,
    shared_engine: Arc<Mutex<(DualSlotMixer, DspPipeline)>>,
    backend: CpalBackend,
    start_time: Instant,
    slot_durations: Arc<(AtomicU64, AtomicU64)>, // f64 duration in bits
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
            active_slot: Arc::new(AtomicU8::new(0)),
            volume: 1.0,
            shared_engine: Arc::new(Mutex::new((DualSlotMixer::new(), DspPipeline::new(48000.0)))),
            backend: CpalBackend::new(),
            start_time: Instant::now(),
            slot_durations: Arc::new((AtomicU64::new(0), AtomicU64::new(0))),
        }
    }

    /// Process incoming correlated request.
    pub fn handle_request(&mut self, req: DaemonRequest) -> DaemonResponse {
        let id = req.id;
        let res = self.handle_command(req.command);
        DaemonResponse { id, result: res }
    }

    /// Ensure CPAL live output stream is initialized and bound to the shared audio mixer.
    pub fn ensure_backend_open(&mut self) -> Result<(), SinkError> {
        if self.backend.is_open() {
            return Ok(());
        }

        let shared_cb = Arc::clone(&self.shared_engine);
        let active_slot_cb = Arc::clone(&self.active_slot);
        let is_playing_cb = Arc::clone(&self.is_playing);

        let render_fn = move |data: &mut [f32]| -> usize {
            if !is_playing_cb.load(Ordering::Relaxed) {
                data.fill(0.0);
                return data.len();
            }

            if let Ok(mut guard) = shared_cb.try_lock() {
                let (mixer, dsp) = &mut *guard;
                let written = mixer.render(data);
                if written > 0 {
                    dsp.process(&mut data[..written]);
                }
                let slot_idx = match mixer.active_slot {
                    LibSlotId::A => 0,
                    LibSlotId::B => 1,
                };
                active_slot_cb.store(slot_idx, Ordering::Relaxed);
                written
            } else {
                data.fill(0.0);
                data.len()
            }
        };

        let spec = AudioSpec::new_f32_stereo(48000);
        self.backend.open_with_render_fn(spec, render_fn)
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

                match slot {
                    SlotId::A => self.slot_durations.0.store(duration_secs.to_bits(), Ordering::Release),
                    SlotId::B => self.slot_durations.1.store(duration_secs.to_bits(), Ordering::Release),
                }

                let target_rate = 48000;
                let spec = AudioSpec::new_f32_stereo(target_rate);
                let (mut producer, consumer) = BoundedAudioTransport::create(&spec, 3.0);
                let stop_signal = Arc::new(AtomicBool::new(false));

                // Spawn background decoder thread with sample-rate adaptation
                let stop_clone = Arc::clone(&stop_signal);
                let path_clone = path.clone();
                thread::spawn(move || {
                    if let Ok(mut pipeline) = DecoderPipeline::open(&path_clone) {
                        let in_rate = pipeline.spec().sample_rate;
                        let mut resample_staging: Vec<f32> = Vec::new();

                        while !stop_clone.load(Ordering::Relaxed) {
                            match pipeline.decode_next() {
                                Ok(Some(samples)) => {
                                    let push_slice = if in_rate == target_rate {
                                        samples
                                    } else {
                                        // Linear interpolation resampler for interleaved stereo
                                        let in_frames = samples.len() / 2;
                                        if in_frames == 0 {
                                            continue;
                                        }
                                        let out_frames = ((in_frames as f64) * (target_rate as f64) / (in_rate as f64)).round() as usize;
                                        resample_staging.clear();
                                        resample_staging.reserve(out_frames * 2);
                                        let ratio = in_rate as f64 / target_rate as f64;
                                        for i in 0..out_frames {
                                            let src_pos = i as f64 * ratio;
                                            let idx0 = (src_pos.floor() as usize).min(in_frames - 1);
                                            let frac = (src_pos - idx0 as f64) as f32;
                                            let idx1 = (idx0 + 1).min(in_frames - 1);

                                            let l0 = samples[idx0 * 2];
                                            let r0 = samples[idx0 * 2 + 1];
                                            let l1 = samples[idx1 * 2];
                                            let r1 = samples[idx1 * 2 + 1];

                                            resample_staging.push(l0 * (1.0 - frac) + l1 * frac);
                                            resample_staging.push(r0 * (1.0 - frac) + r1 * frac);
                                        }
                                        &resample_staging
                                    };

                                    if producer.push_with_backpressure(push_slice, &stop_clone).is_err() {
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

                if let Ok(mut guard) = self.shared_engine.lock() {
                    guard.0.slot_mut(lib_slot).prime(consumer, spec, stop_signal);
                }

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
                let standby = if self.active_slot.load(Ordering::Relaxed) == 0 {
                    SlotId::B
                } else {
                    SlotId::A
                };
                self.handle_command(DaemonCommand::Load { slot: standby, path })
            }
            DaemonCommand::Play => {
                let active_id = if self.active_slot.load(Ordering::Relaxed) == 0 {
                    LibSlotId::A
                } else {
                    LibSlotId::B
                };

                if let Ok(guard) = self.shared_engine.lock() {
                    if guard.0.slot(active_id).state == engine_lib::mixer::SlotState::Empty {
                        return DaemonResult::Error {
                            message: "No track loaded in active slot".to_string(),
                        };
                    }
                }

                if let Err(e) = self.ensure_backend_open() {
                    return DaemonResult::Error {
                        message: format!("Failed to open audio output: {}", e),
                    };
                }

                self.state = PlaybackState::Playing;
                self.is_playing.store(true, Ordering::Release);

                if let Ok(mut guard) = self.shared_engine.lock() {
                    guard.0.play();
                }
                let _ = self.backend.start();
                DaemonResult::Ok { data: None }
            }
            DaemonCommand::Pause => {
                self.state = PlaybackState::Paused;
                self.is_playing.store(false, Ordering::Release);
                if let Ok(mut guard) = self.shared_engine.lock() {
                    guard.0.pause();
                }
                let _ = self.backend.pause();
                DaemonResult::Ok { data: None }
            }
            DaemonCommand::Stop => {
                self.state = PlaybackState::Stopped;
                self.is_playing.store(false, Ordering::Release);
                if let Ok(mut guard) = self.shared_engine.lock() {
                    guard.0.pause();
                }
                let _ = self.backend.stop();
                DaemonResult::Ok { data: None }
            }
            DaemonCommand::Seek { position_secs: _ } => {
                // In production, seek repositions active decoder and flushes ring buffer
                DaemonResult::Ok { data: None }
            }
            DaemonCommand::Crossfade { duration_ms } => {
                let frames = ((duration_ms as f64 / 1000.0) * 48000.0).round() as usize;
                if let Ok(mut guard) = self.shared_engine.lock() {
                    if let Err(e) = guard.0.start_crossfade(frames) {
                        return DaemonResult::Error { message: e.to_string() };
                    }
                }
                DaemonResult::Ok { data: None }
            }
            DaemonCommand::SetVolume { volume } => {
                self.volume = volume.clamp(0.0, 1.0);
                if let Ok(mut guard) = self.shared_engine.lock() {
                    guard.0.set_volume(self.volume);
                }
                DaemonResult::Ok { data: None }
            }
            DaemonCommand::SetEq { gains } => {
                if let Ok(mut guard) = self.shared_engine.lock() {
                    let mut dsp_config = guard.1.config().clone();
                    dsp_config.eq_gains = gains;
                    guard.1.update_config(dsp_config);
                }
                DaemonResult::Ok { data: None }
            }
            DaemonCommand::SetDsp { bypass, rg_db, karaoke, limiter } => {
                if let Ok(mut guard) = self.shared_engine.lock() {
                    let current_gains = guard.1.config().eq_gains;
                    guard.1.update_config(DspConfig {
                        bypass,
                        replaygain_db: rg_db,
                        eq_gains: current_gains,
                        karaoke,
                        limiter,
                    });
                }
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
                let slot_id = if self.active_slot.load(Ordering::Relaxed) == 0 {
                    SlotId::A
                } else {
                    SlotId::B
                };
                DaemonResult::Ok {
                    data: Some(serde_json::json!({
                        "state": self.state,
                        "active_slot": slot_id,
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
        let active_slot_hb = Arc::clone(&self.active_slot);
        let slot_durations_hb = Arc::clone(&self.slot_durations);
        let stats_ref = self.backend.shared_stats();
        let start_time = self.start_time;

        thread::spawn(move || {
            let mut hb_stdout = std::io::stdout();
            while running_hb.load(Ordering::Relaxed) {
                thread::sleep(Duration::from_millis(250));

                if is_playing_hb.load(Ordering::Relaxed) {
                    let wallclock_ms = start_time.elapsed().as_millis() as u64;
                    let slot_id = if active_slot_hb.load(Ordering::Relaxed) == 0 {
                        SlotId::A
                    } else {
                        SlotId::B
                    };
                    let duration_bits = if slot_id == SlotId::A {
                        slot_durations_hb.0.load(Ordering::Relaxed)
                    } else {
                        slot_durations_hb.1.load(Ordering::Relaxed)
                    };
                    let duration_secs = f64::from_bits(duration_bits);
                    let snapshot = stats_ref.snapshot(48000);

                    let heartbeat = DaemonEvent::Heartbeat {
                        active_slot: slot_id,
                        position_secs: snapshot.position_seconds,
                        duration_secs,
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
        if let Ok(mut guard) = self.shared_engine.lock() {
            guard.0.pause();
        }
        let _ = self.backend.stop();
    }
}
