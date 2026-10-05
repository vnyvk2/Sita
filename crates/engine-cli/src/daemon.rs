//! Daemon loop and asynchronous command dispatcher for engine-cli.

use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicU8, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use engine_protocol::{
    generate_boot_id, DaemonCommand, DaemonEvent, DaemonRequest, DaemonResponse, DaemonResult,
    PlaybackState, SlotId, SoundProfile, SoundProfileStatus,
};
use engine_lib::buffer::BoundedAudioTransport;
use engine_lib::decoder::{DecoderPipeline, StereoResampler};
use engine_lib::dsp::{DspConfig, DspPipeline};
use engine_lib::mixer::{DualSlotMixer, SlotId as LibSlotId};
use engine_lib::sink::{AudioSource, CpalBackend, OutputBackend};
use engine_lib::types::{AudioSpec, SinkError};

/// Core daemon controller managing background decoder threads, audio sinks, and the 4Hz heartbeat.
///
/// # Rate policy: resample-to-device
///
/// The engine renders at the output device's default rate (`output_rate`,
/// resolved when the backend opens; 48 kHz fallback clock when headless).
/// File content at any other rate is sinc-resampled (rubato FFT) in the
/// decoder thread — never linear hold. DSP coefficients, crossfade lengths,
/// and the playhead divisor all derive from `output_rate`: one source of
/// truth, not a hardcoded 48 kHz scattered across call sites.
pub struct EngineDaemon {
    boot_id: u64,
    sequence_id: Arc<AtomicU64>,
    sound_profile: Arc<AtomicU8>, // 0 for StudioReference, 1 for VocalNuanceBoost
    running: Arc<AtomicBool>,
    is_playing: Arc<AtomicBool>,
    state: PlaybackState,
    active_slot: Arc<AtomicU8>, // 0 for SlotId::A, 1 for SlotId::B
    volume: Arc<AtomicU32>, // master gain as f32 bits; applied post-DSP (see below)
    shared_engine: Arc<Mutex<(DualSlotMixer, DspPipeline)>>,
    backend: CpalBackend,
    start_time: Instant,
    slot_durations: Arc<(AtomicU64, AtomicU64)>, // f64 duration in bits
    slot_base_secs: Arc<(AtomicU64, AtomicU64)>, // per-slot playhead base in f64 bits
    slot_paths: Arc<Mutex<[Option<String>; 2]>>, // last loaded path per slot for seek respawn
    eos_notified: Arc<(AtomicBool, AtomicBool)>, // TrackEnd already emitted per slot
    output_rate: Arc<AtomicU32>, // device render rate in Hz; single source of truth
    cb_contention: Arc<AtomicU64>, // RT callback lock losses; DAC-session audit instrument
}

impl Default for EngineDaemon {
    fn default() -> Self {
        Self::new()
    }
}

impl EngineDaemon {
    pub fn new() -> Self {
        let boot_id = generate_boot_id();
        Self {
            boot_id,
            sequence_id: Arc::new(AtomicU64::new(0)),
            sound_profile: Arc::new(AtomicU8::new(0)),
            running: Arc::new(AtomicBool::new(true)),
            is_playing: Arc::new(AtomicBool::new(false)),
            state: PlaybackState::Stopped,
            active_slot: Arc::new(AtomicU8::new(0)),
            volume: Arc::new(AtomicU32::new(1.0f32.to_bits())),
            shared_engine: Arc::new(Mutex::new((DualSlotMixer::new(), DspPipeline::new(48000.0)))),
            backend: CpalBackend::new(),
            start_time: Instant::now(),
            slot_durations: Arc::new((AtomicU64::new(0), AtomicU64::new(0))),
            slot_base_secs: Arc::new((AtomicU64::new(0), AtomicU64::new(0))),
            slot_paths: Arc::new(Mutex::new([None, None])),
            eos_notified: Arc::new((AtomicBool::new(false), AtomicBool::new(false))),
            output_rate: Arc::new(AtomicU32::new(48000)),
            cb_contention: Arc::new(AtomicU64::new(0)),
        }
    }

    /// Process incoming correlated request and optional synchronous push event.
    pub fn handle_request(&mut self, req: DaemonRequest) -> (DaemonResponse, Option<DaemonEvent>) {
        let id = req.id;
        let maybe_event = match req.command {
            DaemonCommand::SetSoundProfile { profile } => {
                let seq = self.sequence_id.load(Ordering::Relaxed) + 1;
                // Intentionally emit status: SoundProfileStatus::Active synchronously
                // to commit the new profile target to the client/UI epoch, while the
                // real-time audio thread executes the 30ms smooth cosine-squared ramp.
                // Any live state queries during the ramp via GetState report Transitioning.
                Some(DaemonEvent::SoundProfileChanged {
                    profile,
                    status: SoundProfileStatus::Active,
                    boot_id: self.boot_id,
                    sequence_id: seq,
                })
            }
            _ => None,
        };
        let res = self.handle_command(req.command);
        (DaemonResponse { id, result: res }, maybe_event)
    }

    /// Ensure CPAL live output stream is initialized and bound to the shared audio mixer.
    pub fn ensure_backend_open(&mut self) -> Result<(), SinkError> {
        if self.backend.is_open() {
            return Ok(());
        }

        // Resolve the render rate BEFORE opening: device default when hardware
        // is present, 48 kHz fallback clock otherwise. Everything downstream
        // (resamplers, DSP, playhead) derives from this one value.
        if !self.backend.has_device() {
            let _ = self.backend.select_device(None);
        }
        if let Some(rate) = self.backend.default_output_rate() {
            self.output_rate.store(rate, Ordering::Release);
        }
        let target_rate = self.output_rate.load(Ordering::Acquire);
        // Retune rate-sensitive DSP to the render rate exactly once per open.
        if let Ok(mut guard) = self.shared_engine.lock() {
            guard.1.set_sample_rate(target_rate as f32);
        }

        let shared_cb = Arc::clone(&self.shared_engine);
        let active_slot_cb = Arc::clone(&self.active_slot);
        let is_playing_cb = Arc::clone(&self.is_playing);
        let contention_cb = Arc::clone(&self.cb_contention);
        let volume_cb = Arc::clone(&self.volume);
        let sound_profile_cb = Arc::clone(&self.sound_profile);

        let render_fn = move |data: &mut [f32]| -> usize {
            if !is_playing_cb.load(Ordering::Relaxed) {
                data.fill(0.0);
                // Paused silence must NOT advance any playhead counter.
                return 0;
            }

            if let Ok(mut guard) = shared_cb.try_lock() {
                let (mixer, dsp) = &mut *guard;
                let profile_val = sound_profile_cb.load(Ordering::Acquire);
                let target_profile = match profile_val {
                    0 => SoundProfile::StudioReference,
                    _ => SoundProfile::VocalNuanceBoost,
                };
                if dsp.sound_profile() != target_profile {
                    dsp.set_sound_profile(target_profile);
                }

                // The mixer renders at unity gain: master volume is applied
                // BELOW, after the DSP chain, so ReplayGain/EQ see full-scale
                // audio and the peak limiter's threshold means what it says
                // at every volume setting.
                let written = mixer.render(data);
                if written > 0 {
                    dsp.process(&mut data[..written]);
                    let vol = f32::from_bits(volume_cb.load(Ordering::Relaxed));
                    if (vol - 1.0).abs() > f32::EPSILON {
                        for s in &mut data[..written] {
                            *s *= vol;
                        }
                    }
                }
                if written < data.len() {
                    data[written..].fill(0.0);
                }
                let slot_idx = match mixer.active_slot {
                    LibSlotId::A => 0,
                    LibSlotId::B => 1,
                };
                active_slot_cb.store(slot_idx, Ordering::Relaxed);
                written
            } else {
                // Contention policy (documented, deliberate): the callback
                // NEVER blocks — a mutex hold here risks priority inversion
                // and a dropout far worse than one silent period. Holds are
                // sub-microsecond (brief command application only; slot
                // mutation structurally requires the lock, so an Arc-swap of
                // "params" could not remove it), making this path rare and
                // concentrated at transitions. It is counted, playhead-neutral
                // (returns 0, sink records 0), and queryable via GetState's
                // `cb_contention` for the DAC-session blip audit.
                contention_cb.fetch_add(1, Ordering::Relaxed);
                data.fill(0.0);
                0
            }
        };

        let spec = AudioSpec::new_f32_stereo(target_rate);
        self.backend.open_with_render_fn(spec, render_fn)
    }

    #[inline]
    fn output_rate_hz(&self) -> u32 {
        self.output_rate.load(Ordering::Acquire).max(8000)
    }

    fn slot_idx(slot: SlotId) -> usize {
        match slot {
            SlotId::A => 0,
            SlotId::B => 1,
        }
    }

    fn set_base_secs(&self, idx: usize, secs: f64) {
        if idx == 0 {
            self.slot_base_secs.0.store(secs.to_bits(), Ordering::Release);
        } else {
            self.slot_base_secs.1.store(secs.to_bits(), Ordering::Release);
        }
    }

    fn base_secs(&self, idx: usize) -> f64 {
        f64::from_bits(if idx == 0 {
            self.slot_base_secs.0.load(Ordering::Acquire)
        } else {
            self.slot_base_secs.1.load(Ordering::Acquire)
        })
    }

    /// Per-slot playhead: base offset + frames consumed by that slot's ring
    /// buffer. Never uses cumulative backend totals, so track changes and
    /// seeks cannot leak the previous song's time.
    fn current_position_secs(&self) -> f64 {
        let idx = self.active_slot.load(Ordering::Relaxed) as usize;
        let base = self.base_secs(idx);
        let id = if idx == 0 { LibSlotId::A } else { LibSlotId::B };
        let frames = if let Ok(guard) = self.shared_engine.lock() {
            guard.0.slot(id).frames_consumed
        } else {
            0
        };
        base + frames as f64 / self.output_rate_hz() as f64
    }

    fn duration_secs(&self, idx: usize) -> f64 {
        f64::from_bits(if idx == 0 {
            self.slot_durations.0.load(Ordering::Relaxed)
        } else {
            self.slot_durations.1.load(Ordering::Relaxed)
        })
    }

    /// Re-stream the active slot from `target_secs` through the same decode
    /// path as Load: new ring pair, decoder seeks first, prime() retires the
    /// old decoder (no orphan) and resets frames_consumed. Shared by Seek and
    /// by Play-on-Eos (replay after natural end).
    fn respawn_active_at(&mut self, target_secs: f64) -> Result<(), String> {
        let idx = self.active_slot.load(Ordering::Relaxed) as usize;
        let lib_slot = if idx == 0 { LibSlotId::A } else { LibSlotId::B };
        let target = target_secs.max(0.0);
        let duration = self.duration_secs(idx);
        let clamped = if duration > 0.0 { target.min(duration) } else { target };

        let path = self
            .slot_paths
            .lock()
            .ok()
            .and_then(|p| p[idx].clone())
            .ok_or_else(|| "No track loaded in active slot".to_string())?;

        let target_rate = self.output_rate_hz();
        let spec = AudioSpec::new_f32_stereo(target_rate);
        let (producer, consumer) = BoundedAudioTransport::create(&spec, 3.0);
        let stop_signal = Arc::new(AtomicBool::new(false));
        Self::spawn_decoder_thread(
            path,
            clamped,
            producer,
            Arc::clone(&stop_signal),
            target_rate,
        );

        if let Ok(mut guard) = self.shared_engine.lock() {
            guard.0.cancel_crossfade(lib_slot);
            guard.0.slot_mut(lib_slot).prime(consumer, spec, stop_signal);
            // Keep the freshly primed slot playing if we were playing.
            if self.state == PlaybackState::Playing {
                guard.0.slot_mut(lib_slot).play();
            }
            guard.1.reset_state();
        }
        self.set_base_secs(idx, clamped);
        if idx == 0 {
            self.eos_notified.0.store(false, Ordering::Release);
        } else {
            self.eos_notified.1.store(false, Ordering::Release);
        }
        Ok(())
    }
    /// Spawn the background decode+resample pump for one slot.
    /// `start_secs` seeks the pipeline first; content is sinc-resampled to
    /// the device rate (passthrough when equal). Runs off-RT; allocations OK.
    fn spawn_decoder_thread(
        path: String,
        start_secs: f64,
        mut producer: engine_lib::buffer::AudioProducer,
        stop_flag: Arc<AtomicBool>,
        target_rate: u32,
    ) {
        thread::spawn(move || {
            let Ok(mut pipeline) = DecoderPipeline::open(&path) else {
                stop_flag.store(true, Ordering::Relaxed);
                return;
            };
            if start_secs > 0.0 {
                // Best effort: a failed seek still streams from 0 rather than
                // hanging the slot silent.
                let _ = pipeline.seek(start_secs);
            }
            let in_rate = pipeline.spec().sample_rate;
            let Ok(mut resampler) = StereoResampler::new(in_rate, target_rate) else {
                log::error!("resampler construction failed ({} -> {})", in_rate, target_rate);
                stop_flag.store(true, Ordering::Relaxed);
                return;
            };
            let mut staging: Vec<f32> = Vec::new();

            // Push helper: backpressure-write, aborting on stop/cancel.
            let mut push_out = |staging: &mut Vec<f32>| -> bool {
                if staging.is_empty() {
                    return true;
                }
                let ok = producer.push_with_backpressure(staging, &stop_flag).is_ok();
                staging.clear();
                ok
            };

            while !stop_flag.load(Ordering::Relaxed) {
                match pipeline.decode_next() {
                    Ok(Some(samples)) => {
                        // Pipeline always emits interleaved stereo; guard
                        // against a corrupt odd tail instead of indexing OOB.
                        if samples.len() < 2 || samples.len() % 2 != 0 {
                            continue;
                        }
                        if resampler.push_interleaved(samples, &mut staging).is_err() {
                            break;
                        }
                        if !push_out(&mut staging) {
                            break;
                        }
                    }
                    Ok(None) => {
                        // Natural EOF: flush the resampler tail so the exact
                        // file length lands in the ring, then signal so the
                        // slot can transition to Eos and the heartbeat can
                        // emit TrackEnd (auto-advance depends on it).
                        let _ = resampler.flush(&mut staging);
                        let _ = push_out(&mut staging);
                        stop_flag.store(true, Ordering::Relaxed);
                        break;
                    }
                    Err(_) => {
                        stop_flag.store(true, Ordering::Relaxed);
                        break;
                    }
                }
            }
        });
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
                // Fresh per-slot playhead: base 0, no stale TrackEnd.
                self.set_base_secs(Self::slot_idx(slot), 0.0);
                if Self::slot_idx(slot) == 0 {
                    self.eos_notified.0.store(false, Ordering::Release);
                } else {
                    self.eos_notified.1.store(false, Ordering::Release);
                }
                if let Ok(mut paths) = self.slot_paths.lock() {
                    paths[Self::slot_idx(slot)] = Some(path.clone());
                }

                let target_rate = self.output_rate_hz();
                let spec = AudioSpec::new_f32_stereo(target_rate);
                let (producer, consumer) = BoundedAudioTransport::create(&spec, 3.0);
                let stop_signal = Arc::new(AtomicBool::new(false));

                // Spawn background decoder thread with sinc resampling
                Self::spawn_decoder_thread(path.clone(), 0.0, producer, Arc::clone(&stop_signal), target_rate);

                // prime() signals any previous decoder on this slot to exit
                // before dropping its consumer (no orphaned threads).
                if let Ok(mut guard) = self.shared_engine.lock() {
                    let was_crossfading = guard.0.crossfade.is_some();
                    guard.0.cancel_crossfade(lib_slot);
                    guard.0.slot_mut(lib_slot).prime(consumer, spec, stop_signal);
                    if was_crossfading {
                        self.active_slot.store(Self::slot_idx(slot) as u8, Ordering::Release);
                    }
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
                // Replay after natural end: slot.play() cannot leave Eos, so
                // re-stream from 0 instead of playing silence forever.
                // (Separate scope: the lock temporary above must be dead
                // before the mutable respawn borrows self.)
                let at_eos = self
                    .shared_engine
                    .lock()
                    .ok()
                    .map(|g| g.0.slot(active_id).state == engine_lib::mixer::SlotState::Eos)
                    .unwrap_or(false);
                if at_eos {
                    if let Err(message) = self.respawn_active_at(0.0) {
                        return DaemonResult::Error { message };
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
                    let active_slot = guard.0.active_slot;
                    guard.0.cancel_crossfade(active_slot);
                    guard.0.pause();
                }
                let _ = self.backend.stop();
                DaemonResult::Ok { data: None }
            }
            DaemonCommand::Seek { position_secs } => {
                // Re-stream the slot from the target offset through the same
                // decode path as Load: new ring pair, decoder seeks first,
                // prime() retires the old decoder (no orphan) and resets
                // frames_consumed. Base is set while holding the mixer lock so
                // the audio callback cannot interleave a torn seek.
                match self.respawn_active_at(position_secs) {
                    Ok(()) => DaemonResult::Ok { data: None },
                    Err(message) => DaemonResult::Error { message },
                }
            }
            DaemonCommand::Crossfade { duration_ms } => {
                let frames =
                    ((duration_ms as f64 / 1000.0) * self.output_rate_hz() as f64).round() as usize;
                if let Ok(mut guard) = self.shared_engine.lock() {
                    if let Err(e) = guard.0.start_crossfade(frames) {
                        return DaemonResult::Error { message: e.to_string() };
                    }
                }
                DaemonResult::Ok { data: None }
            }
            DaemonCommand::SetVolume { volume } => {
                // Lock-free: the render closure reads this atomic post-DSP,
                // so volume changes never contend with the audio callback.
                // (DualSlotMixer::set_volume stays at unity in daemon use;
                // its own API + tests are unchanged.)
                self.volume
                    .store(volume.clamp(0.0, 1.0).to_bits(), Ordering::Release);
                DaemonResult::Ok { data: None }
            }
            DaemonCommand::SetEq { gains } => {
                if let Ok(mut guard) = self.shared_engine.lock() {
                    // T-EQ-SMOOTH: route live EQ updates through the smoothed
                    // path so preset jumps ramp instead of stepping the output.
                    guard.1.set_eq_gains_smooth(gains);
                }
                DaemonResult::Ok { data: None }
            }
            DaemonCommand::SetDsp { bypass, rg_db, karaoke, limiter } => {
                if let Ok(mut guard) = self.shared_engine.lock() {
                    let current_gains = guard.1.config().eq_gains;
                    let current_profile = guard.1.config().sound_profile;
                    guard.1.update_config(DspConfig {
                        bypass,
                        replaygain_db: rg_db,
                        eq_gains: current_gains,
                        karaoke,
                        limiter,
                        sound_profile: current_profile,
                    });
                }
                DaemonResult::Ok { data: None }
            }
            DaemonCommand::SetSoundProfile { profile } => {
                let seq = self.sequence_id.fetch_add(1, Ordering::SeqCst) + 1;
                let profile_val = match profile {
                    SoundProfile::StudioReference => 0,
                    SoundProfile::VocalNuanceBoost => 1,
                };
                self.sound_profile.store(profile_val, Ordering::Release);
                // transition_ms: 30 informs the client of the smooth DSP cross-modulation
                // ramp duration applied asynchronously on the audio callback thread.
                DaemonResult::Ok {
                    data: Some(serde_json::json!({
                        "profile": profile,
                        "transition_ms": 30,
                        "boot_id": self.boot_id,
                        "sequence_id": seq,
                    })),
                }
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
                let profile = match self.sound_profile.load(Ordering::Acquire) {
                    0 => SoundProfile::StudioReference,
                    _ => SoundProfile::VocalNuanceBoost,
                };
                let status = if let Ok(guard) = self.shared_engine.try_lock() {
                    guard.1.sound_profile_status()
                } else {
                    SoundProfileStatus::Active
                };
                DaemonResult::Ok {
                    data: Some(serde_json::json!({
                        "state": self.state,
                        "active_slot": slot_id,
                        "volume": f32::from_bits(self.volume.load(Ordering::Acquire)),
                        "xrun_count": stats.xrun_count,
                        "low_water_mark": stats.low_water_mark,
                        "position_secs": self.current_position_secs(),
                        "cb_contention": self.cb_contention.load(Ordering::Relaxed),
                        "sound_profile": profile,
                        "sound_profile_status": status,
                        "boot_id": self.boot_id,
                        "sequence_id": self.sequence_id.load(Ordering::Relaxed),
                    })),
                }
            }
        }
    }

    /// Run the interactive stdio JSON-lines protocol loop.
    pub fn run_stdio_loop(&mut self) {
        use std::io::BufRead;
        // Single shared stdout lock: the heartbeat thread and the command loop
        // must never interleave partial JSON lines.
        let stdout_lock = Arc::new(Mutex::new(std::io::stdout()));

        // 1. Emit Readiness Handshake event immediately with process boot_id
        let ready_event = DaemonEvent::Ready {
            protocol_version: 1,
            engine_version: env!("CARGO_PKG_VERSION").to_string(),
            boot_id: self.boot_id,
        };
        if let Ok(line) = serde_json::to_string(&ready_event) {
            if let Ok(mut out) = stdout_lock.lock() {
                use std::io::Write;
                let _ = writeln!(out, "{}", line);
                let _ = out.flush();
            }
        }

        // 2. Spawn Gated 4Hz Heartbeat thread (only transmits while playing)
        let running_hb = Arc::clone(&self.running);
        let is_playing_hb = Arc::clone(&self.is_playing);
        let active_slot_hb = Arc::clone(&self.active_slot);
        let slot_durations_hb = Arc::clone(&self.slot_durations);
        let slot_base_hb = Arc::clone(&self.slot_base_secs);
        let output_rate_hb = Arc::clone(&self.output_rate);
        let eos_notified_hb = Arc::clone(&self.eos_notified);
        let device_error_hb = self.backend.device_error_flag();
        let shared_hb = Arc::clone(&self.shared_engine);
        let stdout_hb = Arc::clone(&stdout_lock);
        let start_time = self.start_time;

        thread::spawn(move || {
            use std::io::Write;
            let mut last_device_error = false;
            while running_hb.load(Ordering::Relaxed) {
                thread::sleep(Duration::from_millis(250));

                if !is_playing_hb.load(Ordering::Relaxed) {
                    continue;
                }
                let wallclock_ms = start_time.elapsed().as_millis() as u64;
                let slot_idx = active_slot_hb.load(Ordering::Relaxed);
                let slot_id = if slot_idx == 0 { SlotId::A } else { SlotId::B };
                let duration_secs = f64::from_bits(if slot_idx == 0 {
                    slot_durations_hb.0.load(Ordering::Relaxed)
                } else {
                    slot_durations_hb.1.load(Ordering::Relaxed)
                });
                // Single mixer lock per beat: position, EOS state, and the
                // standby buffer check come from one snapshot, halving
                // contention with the RT callback (the other reducer is the
                // lock-free SetVolume path; see contention policy above).
                let (position_secs, eos, natural_transition) = {
                    let base = f64::from_bits(if slot_idx == 0 {
                        slot_base_hb.0.load(Ordering::Acquire)
                    } else {
                        slot_base_hb.1.load(Ordering::Acquire)
                    });
                    let rate = output_rate_hb.load(Ordering::Acquire).max(8000) as f64;
                    shared_hb
                        .lock()
                        .ok()
                        .map(|mut g| {
                            let id = if slot_idx == 0 { LibSlotId::A } else { LibSlotId::B };
                            let standby = if slot_idx == 0 { LibSlotId::B } else { LibSlotId::A };
                            let pos = base + g.0.slot(id).frames_consumed as f64 / rate;
                            let is_eos =
                                g.0.slot(id).state == engine_lib::mixer::SlotState::Eos;
                            // A beat landing between drain and splice would
                            // otherwise emit a spurious TrackEnd for a track
                            // that continues seamlessly: if the standby is
                            // buffered, the next render splices — wait for it.
                            let splice_imminent =
                                is_eos && g.0.slot(standby).has_audio();
                            let transition = g.0.pending_transition_complete.take();
                            (pos, is_eos && !splice_imminent, transition)
                        })
                        .unwrap_or((base, false, None))
                };

                let mut events: Vec<DaemonEvent> = Vec::new();
                // Crossfade/splice completion: only emit when transition actually completed
                // naturally on the audio thread (suppressed on cancellation).
                if let Some(trans_slot) = natural_transition {
                    let new_slot = match trans_slot {
                        LibSlotId::A => SlotId::A,
                        LibSlotId::B => SlotId::B,
                    };
                    events.push(DaemonEvent::TransitionComplete { active_slot: new_slot });
                }

                events.push(DaemonEvent::Heartbeat {
                    active_slot: slot_id,
                    position_secs,
                    duration_secs,
                    wallclock_ms,
                    is_playing: true,
                });

                if eos {
                    let already = if slot_idx == 0 {
                        eos_notified_hb.0.load(Ordering::Acquire)
                    } else {
                        eos_notified_hb.1.load(Ordering::Acquire)
                    };
                    if !already {
                        if slot_idx == 0 {
                            eos_notified_hb.0.store(true, Ordering::Release);
                        } else {
                            eos_notified_hb.1.store(true, Ordering::Release);
                        }
                        // Natural end: renderer auto-advance depends on these.
                        events.push(DaemonEvent::SlotEnd { slot: slot_id });
                        events.push(DaemonEvent::TrackEnd { slot: slot_id });
                        events.push(DaemonEvent::StateChanged { state: PlaybackState::Stopped, position_secs: Some(position_secs) });
                        is_playing_hb.store(false, Ordering::Release);
                    }
                }

                // Device disconnect poll: the CPAL error callback only raises
                // the flag — nobody was reading it, so unplugging a DAC hung
                // playback forever. Surface rising edges; the renderer falls
                // back to WebAudio on DeviceError.
                let err_now = device_error_hb.load(Ordering::Acquire);
                if err_now && !last_device_error {
                    events.push(DaemonEvent::DeviceError {
                        message: "Audio output device disconnected or failed".to_string(),
                    });
                    is_playing_hb.store(false, Ordering::Release);
                }
                last_device_error = err_now;

                if let Ok(mut out) = stdout_hb.lock() {
                    for ev in events {
                        if let Ok(line) = serde_json::to_string(&ev) {
                            let _ = writeln!(out, "{}", line);
                        }
                    }
                    let _ = out.flush();
                }
            }
        });

        // 3. Stdin Command Processing Loop with graceful EOF termination.
        // Uses read_until + lossy UTF-8 so one bad byte cannot kill the daemon,
        // and caps line length to bound memory on a missing newline.
        let stdin = std::io::stdin();
        let mut reader = stdin.lock();
        let mut buf: Vec<u8> = Vec::new();
        const MAX_LINE_BYTES: usize = 1_048_576;

        while self.running.load(Ordering::Relaxed) {
            buf.clear();
            match reader.read_until(b'\n', &mut buf) {
                Ok(0) => {
                    // EOF on stdin: Parent process terminated or closed pipe. Exit cleanly.
                    log::info!("Stdin reached EOF, terminating engine daemon cleanly");
                    break;
                }
                Ok(_) => {
                    if buf.len() > MAX_LINE_BYTES {
                        let resp = DaemonResponse::error(
                            u64::MAX,
                            "Request line exceeds 1MiB; rejected".to_string(),
                        );
                        if let Ok(resp_json) = serde_json::to_string(&resp) {
                            if let Ok(mut out) = stdout_lock.lock() {
                                use std::io::Write;
                                let _ = writeln!(out, "{}", resp_json);
                                let _ = out.flush();
                            }
                        }
                        continue;
                    }
                    let trimmed = String::from_utf8_lossy(&buf);
                    let trimmed = trimmed.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    match serde_json::from_str::<DaemonRequest>(trimmed) {
                        Ok(req) => {
                            let (resp, maybe_event) = self.handle_request(req);
                            if let Ok(resp_json) = serde_json::to_string(&resp) {
                                if let Ok(mut out) = stdout_lock.lock() {
                                    use std::io::Write;
                                    let _ = writeln!(out, "{}", resp_json);
                                    if let Some(ev) = maybe_event {
                                        if let Ok(ev_json) = serde_json::to_string(&ev) {
                                            let _ = writeln!(out, "{}", ev_json);
                                        }
                                    }
                                    let _ = out.flush();
                                }
                            }
                        }
                        Err(e) => {
                            // u64::MAX can never collide with a real request id
                            // assigned from 1 upward.
                            let resp = DaemonResponse::error(u64::MAX, format!("Malformed request JSON: {}", e));
                            if let Ok(resp_json) = serde_json::to_string(&resp) {
                                if let Ok(mut out) = stdout_lock.lock() {
                                    use std::io::Write;
                                    let _ = writeln!(out, "{}", resp_json);
                                    let _ = out.flush();
                                }
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
