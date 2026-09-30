//! Live audio output sink utilizing CPAL (Cross-Platform Audio Library).
//!
//! Provides platform device enumeration, dual-format F32 / I16 output support,
//! allocation-free TPDF dither, continuous silence pause emission, and resilient error recovery.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, Host, SampleFormat, Stream, StreamConfig};

use crate::sink::OutputBackend;
use crate::types::{AudioSpec, BackendStats, SharedSinkStats, SinkError};

/// Fast pseudo-random number generator for zero-allocation TPDF dithering.
struct XorShift32(u32);

impl XorShift32 {
    #[inline]
    fn next_u32(&mut self) -> u32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        x
    }

    /// Generate triangular probability density function (TPDF) dither noise in range [-1.0/32768, 1.0/32768].
    #[inline]
    fn next_tpdf_i16(&mut self) -> f32 {
        let r1 = (self.next_u32() & 0xFFFF) as f32 / 65535.0;
        let r2 = (self.next_u32() & 0xFFFF) as f32 / 65535.0;
        // Two independent uniform random numbers subtracted give triangular PDF
        (r1 - r2) / 32768.0
    }
}

/// Safe Send/Sync wrapper around cpal::Stream.
pub struct SendStream(pub Stream);
unsafe impl Send for SendStream {}
unsafe impl Sync for SendStream {}

/// Live audio output sink wrapping an active CPAL audio stream with real-time paced fallback.
pub struct CpalBackend {
    host: Host,
    device: Option<Device>,
    stream: Option<SendStream>,
    spec: Option<AudioSpec>,
    stats: Arc<SharedSinkStats>,
    is_open: bool,
    is_running: bool,
    device_error: Arc<AtomicBool>,
    fallback_thread: Option<std::thread::JoinHandle<()>>,
    fallback_stop: Arc<AtomicBool>,
}

impl Default for CpalBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl CpalBackend {
    /// Create a new CPAL output backend using the platform's default audio host.
    pub fn new() -> Self {
        Self {
            host: cpal::default_host(),
            device: None,
            stream: None,
            spec: None,
            stats: Arc::new(SharedSinkStats::new()),
            is_open: false,
            is_running: false,
            device_error: Arc::new(AtomicBool::new(false)),
            fallback_thread: None,
            fallback_stop: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Query and list available output audio device names on the host.
    pub fn list_output_devices(&self) -> Vec<String> {
        let mut names = Vec::new();
        if let Ok(devices) = self.host.output_devices() {
            for dev in devices {
                if let Ok(name) = dev.name() {
                    names.push(name);
                }
            }
        }
        names
    }

    /// Select output audio device by name, or fall back to default.
    pub fn select_device(&mut self, device_name: Option<&str>) -> Result<(), SinkError> {
        let target_device = if let Some(target) = device_name {
            self.host
                .output_devices()
                .map_err(|e| SinkError::DeviceUnavailable(e.to_string()))?
                .find(|d| d.name().is_ok_and(|n| n == target))
                .ok_or_else(|| SinkError::DeviceUnavailable(format!("Device not found: {}", target)))?
        } else {
            self.host
                .default_output_device()
                .ok_or_else(|| SinkError::DeviceUnavailable("No default output audio device found".to_string()))?
        };

        self.device = Some(target_device);
        Ok(())
    }

    /// Access the shared statistics container.
    pub fn shared_stats(&self) -> Arc<SharedSinkStats> {
        Arc::clone(&self.stats)
    }

    /// Whether an output device has been selected (default or explicit).
    pub fn has_device(&self) -> bool {
        self.device.is_some()
    }

    /// Check if an asynchronous device disconnect or error has occurred.
    pub fn has_device_error(&self) -> bool {
        self.device_error.load(Ordering::Acquire)
    }

    /// Sample rate of the device's default output config, if hardware is present.
    /// The engine renders at this rate (resample-to-device policy); callers
    /// use it to configure decoder resamplers, DSP coefficients, and the
    /// playhead divisor from a single source instead of a hardcoded 48 kHz.
    pub fn default_output_rate(&self) -> Option<u32> {
        self.device
            .as_ref()
            .and_then(|d| d.default_output_config().ok())
            .map(|c| c.sample_rate().0)
    }

    /// Open CPAL output with a custom real-time audio render callback.
    /// If hardware audio devices are unavailable, automatically falls back to a real-time paced clock.
    pub fn open_with_render_fn<F>(&mut self, spec: AudioSpec, mut render_fn: F) -> Result<(), SinkError>
    where
        F: FnMut(&mut [f32]) -> usize + Send + 'static,
    {
        if self.is_open {
            return Err(SinkError::AlreadyOpen);
        }

        if self.device.is_none() {
            let _ = self.select_device(None);
        }

        // Check if physical hardware output is accessible
        let hardware_ready = if let Some(device) = self.device.as_ref() {
            device.default_output_config().is_ok()
        } else {
            false
        };

        if hardware_ready {
            let device = self.device.as_ref().unwrap();
            let supported_config = device
                .default_output_config()
                .map_err(|e| SinkError::CpalError(e.to_string()))?;

            let sample_format = supported_config.sample_format();
            let config: StreamConfig = supported_config.into();

            let stats_clone = Arc::clone(&self.stats);
            let error_flag = Arc::clone(&self.device_error);
            let channels = config.channels as usize;

            let err_fn = move |err: cpal::StreamError| {
                log::error!("CPAL audio stream callback error: {}", err);
                error_flag.store(true, Ordering::Release);
            };

            let stream = match sample_format {
                SampleFormat::F32 => {
                    let stats = stats_clone;
                    device
                        .build_output_stream(
                            &config,
                            move |data: &mut [f32], _| {
                                if stats.is_paused.load(Ordering::Relaxed) {
                                    // Continuous silence pause: fill with zero
                                    data.fill(0.0);
                                    return;
                                }
                                let written = render_fn(data);
                                if written < data.len() {
                                    data[written..].fill(0.0);
                                    // Only valid frames advance the playhead;
                                    // padding is an underrun, not playback.
                                    stats.record_xrun();
                                }
                                stats.record_consumption(written, channels as u16);
                            },
                            err_fn,
                            None,
                        )
                        .map_err(|e| SinkError::CpalError(e.to_string()))?
                }
                SampleFormat::I16 => {
                    let stats = stats_clone;
                    let mut dither = XorShift32(123456789);
                    // Pre-size for the largest plausible device buffer so the
                    // RT callback never mallocs via resize().
                    let mut scratch = vec![0.0f32; 32768];
                    device
                        .build_output_stream(
                            &config,
                            move |data: &mut [i16], _| {
                                if stats.is_paused.load(Ordering::Relaxed) {
                                    data.fill(0);
                                    return;
                                }
                                if scratch.len() < data.len() {
                                    // Rare oversize buffer: grow outside the
                                    // steady state; steady-state never allocs.
                                    scratch.resize(data.len(), 0.0);
                                }
                                let written = render_fn(&mut scratch[..data.len()]);
                                if written < data.len() {
                                    scratch[written..data.len()].fill(0.0);
                                    stats.record_xrun();
                                }
                                for (i, out) in data.iter_mut().enumerate() {
                                    let noise = dither.next_tpdf_i16();
                                    let sample = (scratch[i] + noise) * 32767.0;
                                    *out = sample.round().clamp(-32768.0, 32767.0) as i16;
                                }
                                stats.record_consumption(written, channels as u16);
                            },
                            err_fn,
                            None,
                        )
                        .map_err(|e| SinkError::CpalError(e.to_string()))?
                }
                _ => {
                    return Err(SinkError::CpalError(format!(
                        "Unsupported CPAL sample format: {:?}",
                        sample_format
                    )));
                }
            };

            self.stream = Some(SendStream(stream));
        } else {
            // Physical audio device unavailable — start real-time paced fallback thread
            log::warn!("Audio output device unavailable; starting real-time paced fallback clock");
            let stats_clone = Arc::clone(&self.stats);
            let stop_flag = Arc::new(AtomicBool::new(false));
            self.fallback_stop = Arc::clone(&stop_flag);

            let channels = spec.channels as usize;
            let sample_rate = spec.sample_rate as usize;
            let chunk_frames = (sample_rate / 50).max(256); // 20ms chunk
            let chunk_samples = chunk_frames * channels;

            let handle = std::thread::Builder::new()
                .name("engine-paced-sink".to_string())
                .spawn(move || {
                    let frame_duration = std::time::Duration::from_millis(20);
                    let mut scratch = vec![0.0f32; chunk_samples];
                    let mut next_tick = std::time::Instant::now();

                    while !stop_flag.load(Ordering::Relaxed) {
                        let now = std::time::Instant::now();
                        if now < next_tick {
                            std::thread::sleep(next_tick - now);
                        }
                        next_tick += frame_duration;
                        if next_tick < std::time::Instant::now() {
                            next_tick = std::time::Instant::now();
                        }

                        if stats_clone.is_paused.load(Ordering::Relaxed) {
                            continue;
                        }

                        let written = render_fn(&mut scratch);
                        if written > 0 {
                            stats_clone.record_consumption(written, channels as u16);
                        }
                    }
                })
                .map_err(|e| SinkError::CpalError(e.to_string()))?;

            self.fallback_thread = Some(handle);
        }

        self.spec = Some(spec);
        self.is_open = true;
        self.is_running = false;
        Ok(())
    }
}

impl OutputBackend for CpalBackend {
    fn open(&mut self, spec: AudioSpec) -> Result<(), SinkError> {
        self.open_with_render_fn(spec, |_| 0)
    }

    fn start(&mut self) -> Result<(), SinkError> {
        if !self.is_open {
            return Err(SinkError::NotOpen);
        }

        if let Some(stream) = &self.stream {
            stream.0.play().map_err(|e| SinkError::CpalError(e.to_string()))?;
        }

        self.stats.is_paused.store(false, Ordering::Release);
        self.stats.is_active.store(true, Ordering::Release);
        self.is_running = true;
        Ok(())
    }

    fn pause(&mut self) -> Result<(), SinkError> {
        if !self.is_open {
            return Err(SinkError::NotOpen);
        }

        // Real-time invariant: Stream remains running; we assert is_paused so the callback outputs continuous silence
        self.stats.is_paused.store(true, Ordering::Release);
        self.is_running = false;
        Ok(())
    }

    fn stop(&mut self) -> Result<(), SinkError> {
        if let Some(stream) = self.stream.take() {
            let _ = stream.0.pause();
        }

        self.fallback_stop.store(true, Ordering::Release);
        if let Some(handle) = self.fallback_thread.take() {
            let _ = handle.join();
        }

        self.stats.is_paused.store(false, Ordering::Release);
        self.stats.is_active.store(false, Ordering::Release);
        self.is_open = false;
        self.is_running = false;
        Ok(())
    }

    fn stats(&self) -> BackendStats {
        let sample_rate = self.spec.map_or(48000, |s| s.sample_rate);
        self.stats.snapshot(sample_rate)
    }

    fn is_open(&self) -> bool {
        self.is_open
    }

    fn is_running(&self) -> bool {
        self.is_running
    }
}

impl Drop for CpalBackend {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}
