//! Core audio types, telemetry structures, and domain errors for the Nora Audio Engine.

use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::time::Duration;
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Format of raw audio samples.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SampleType {
    /// 32-bit IEEE 754 floating-point (-1.0 to +1.0).
    F32,
    /// 16-bit signed integer (-32768 to +32767).
    I16,
}

impl SampleType {
    /// Returns the size in bytes of a single sample of this format.
    #[inline]
    pub const fn bytes_per_sample(self) -> usize {
        match self {
            SampleType::F32 => 4,
            SampleType::I16 => 2,
        }
    }
}

impl Default for SampleType {
    fn default() -> Self {
        SampleType::F32
    }
}

/// Specifications defining an audio stream's configuration.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct AudioSpec {
    /// Sample rate in Hertz (e.g. 44100, 48000, 96000, 192000).
    pub sample_rate: u32,
    /// Number of audio channels (1 = mono, 2 = stereo).
    pub channels: u16,
    /// Sample data representation.
    pub format: SampleType,
}

impl AudioSpec {
    /// Create a new AudioSpec.
    pub const fn new(sample_rate: u32, channels: u16, format: SampleType) -> Self {
        Self {
            sample_rate,
            channels,
            format,
        }
    }

    /// Convenience constructor for standard 32-bit float stereo streams.
    pub const fn new_f32_stereo(sample_rate: u32) -> Self {
        Self {
            sample_rate,
            channels: 2,
            format: SampleType::F32,
        }
    }

    /// Number of samples contained in a single multi-channel frame.
    #[inline]
    pub const fn samples_per_frame(&self) -> usize {
        self.channels as usize
    }

    /// Size in bytes of a single frame across all channels.
    #[inline]
    pub const fn frame_size(&self) -> usize {
        self.samples_per_frame() * self.format.bytes_per_sample()
    }

    /// Convert a duration into total audio frames.
    pub fn duration_to_frames(&self, duration: Duration) -> u64 {
        (duration.as_secs_f64() * self.sample_rate as f64).round() as u64
    }

    /// Convert a duration into total individual channel samples.
    pub fn duration_to_samples(&self, duration: Duration) -> usize {
        (self.duration_to_frames(duration) as usize)
            .saturating_mul(self.channels as usize)
    }

    /// Convert frame count to Duration.
    pub fn frames_to_duration(&self, frames: u64) -> Duration {
        if self.sample_rate == 0 {
            return Duration::ZERO;
        }
        Duration::from_secs_f64(frames as f64 / self.sample_rate as f64)
    }

    /// Convert individual sample count to Duration.
    pub fn samples_to_duration(&self, samples: u64) -> Duration {
        let ch = self.channels.max(1) as u64;
        self.frames_to_duration(samples / ch)
    }

    /// Convert frame count to seconds.
    pub fn frames_to_seconds(&self, frames: u64) -> f64 {
        if self.sample_rate == 0 {
            0.0
        } else {
            frames as f64 / self.sample_rate as f64
        }
    }

    /// Validate that the specification parameters are within supported audio bounds.
    pub fn validate(&self) -> Result<(), AudioSpecError> {
        if self.sample_rate < 8000 || self.sample_rate > 384000 {
            return Err(AudioSpecError::UnsupportedSampleRate(self.sample_rate));
        }
        if self.channels != 1 && self.channels != 2 {
            return Err(AudioSpecError::UnsupportedChannels(self.channels));
        }
        Ok(())
    }
}

/// Point-in-time telemetry snapshot of audio backend performance and playhead position.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BackendStats {
    /// Total channel sample values consumed or written.
    pub total_samples_consumed: u64,
    /// Total multi-channel frames consumed (samples / channels).
    pub total_frames_consumed: u64,
    /// Exact playback position in seconds, derived monotonically from frames consumed.
    pub position_seconds: f64,
    /// Total number of buffer underruns/xruns observed.
    pub xrun_count: u64,
    /// Minimum buffer occupancy (in samples) observed since last reset.
    pub low_water_mark: usize,
    /// Whether the backend is currently paused.
    pub is_paused: bool,
}

/// Thread-safe, lock-free telemetry container updated from the real-time audio callback.
#[derive(Debug)]
pub struct SharedSinkStats {
    pub total_samples: AtomicU64,
    pub total_frames: AtomicU64,
    pub xrun_count: AtomicU64,
    pub low_water_mark: AtomicUsize,
    pub is_paused: AtomicBool,
    pub is_active: AtomicBool,
}

impl Default for SharedSinkStats {
    fn default() -> Self {
        Self {
            total_samples: AtomicU64::new(0),
            total_frames: AtomicU64::new(0),
            xrun_count: AtomicU64::new(0),
            low_water_mark: AtomicUsize::new(usize::MAX),
            is_paused: AtomicBool::new(false),
            is_active: AtomicBool::new(false),
        }
    }
}

impl SharedSinkStats {
    pub fn new() -> Self {
        Self::default()
    }

    /// Record consumption of audio samples and multi-channel frames.
    /// Real-time safe: Zero allocations, zero locks, zero syscalls.
    #[inline]
    pub fn record_consumption(&self, samples: usize, channels: u16) {
        let ch = channels.max(1) as usize;
        let frames = samples / ch;
        self.total_samples.fetch_add(samples as u64, Ordering::Relaxed);
        self.total_frames.fetch_add(frames as u64, Ordering::Relaxed);
    }

    /// Record a buffer starvation event (underrun / xrun).
    /// Real-time safe: Zero allocations, zero locks, zero syscalls.
    #[inline]
    pub fn record_xrun(&self) {
        self.xrun_count.fetch_add(1, Ordering::Relaxed);
    }

    /// Update the buffer low-water mark atomically.
    /// Real-time safe: Lock-free CAS loop that only executes when a new minimum is discovered.
    #[inline]
    pub fn update_low_water_mark(&self, occupancy: usize) {
        let mut current_min = self.low_water_mark.load(Ordering::Relaxed);
        while occupancy < current_min {
            match self.low_water_mark.compare_exchange_weak(
                current_min,
                occupancy,
                Ordering::Relaxed,
                Ordering::Relaxed,
            ) {
                Ok(_) => break,
                Err(actual) => current_min = actual,
            }
        }
    }

    /// Capture an immutable point-in-time snapshot of the telemetry counters.
    pub fn snapshot(&self, sample_rate: u32) -> BackendStats {
        let samples = self.total_samples.load(Ordering::Relaxed);
        let frames = self.total_frames.load(Ordering::Relaxed);
        let xruns = self.xrun_count.load(Ordering::Relaxed);
        let lwm = self.low_water_mark.load(Ordering::Relaxed);
        let paused = self.is_paused.load(Ordering::Acquire);
        let pos_secs = if sample_rate == 0 {
            0.0
        } else {
            frames as f64 / sample_rate as f64
        };

        BackendStats {
            total_samples_consumed: samples,
            total_frames_consumed: frames,
            position_seconds: pos_secs,
            xrun_count: xruns,
            low_water_mark: if lwm == usize::MAX { 0 } else { lwm },
            is_paused: paused,
        }
    }

    /// Reset all counters to initial zero state.
    pub fn reset(&self) {
        self.total_samples.store(0, Ordering::Relaxed);
        self.total_frames.store(0, Ordering::Relaxed);
        self.xrun_count.store(0, Ordering::Relaxed);
        self.low_water_mark.store(usize::MAX, Ordering::Relaxed);
        self.is_paused.store(false, Ordering::Release);
        self.is_active.store(false, Ordering::Release);
    }
}

// ---------------------------------------------------------------------------
// Error Definitions via thiserror
// ---------------------------------------------------------------------------

#[derive(Debug, Error)]
pub enum EngineError {
    #[error("Audio specification error: {0}")]
    AudioSpec(#[from] AudioSpecError),

    #[error("Audio decoding error: {0}")]
    Decode(#[from] DecodeError),

    #[error("Ring buffer error: {0}")]
    RingBuffer(#[from] RingBufferError),

    #[error("Output sink error: {0}")]
    Sink(#[from] SinkError),

    #[error("Engine state error: {0}")]
    State(#[from] StateError),

    #[error("Hardware device error: {0}")]
    Device(#[from] DeviceError),
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum AudioSpecError {
    #[error("Unsupported sample rate: {0} Hz (supported: 8000 Hz - 384000 Hz)")]
    UnsupportedSampleRate(u32),

    #[error("Unsupported channel count: {0} (supported: 1 = mono, 2 = stereo)")]
    UnsupportedChannels(u16),

    #[error("Invalid zero buffer duration or capacity specified")]
    ZeroCapacity,
}

#[derive(Debug, Error)]
pub enum DecodeError {
    #[error("I/O error opening audio source: {0}")]
    Io(#[from] std::io::Error),

    #[error("Container format probing failed: {0}")]
    ProbeFailed(String),

    #[error("Unsupported container format: {0}")]
    UnsupportedFormat(String),

    #[error("Unsupported codec: {0}")]
    UnsupportedCodec(String),

    #[error("Unsupported codec profile: {0}")]
    UnsupportedProfile(String),

    #[error("No supported audio tracks found in container")]
    NoAudioTrack,

    #[error("Audio packet decode failure: {0}")]
    PacketDecodeFailed(String),

    #[error("End of audio stream reached")]
    EndOfStream,

    #[error("Decoder seek operation failed: {0}")]
    SeekFailed(String),
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum RingBufferError {
    #[error("Ring buffer full: capacity of {capacity} samples exceeded")]
    BufferFull { capacity: usize },

    #[error("Ring buffer empty: no samples available to pop")]
    BufferEmpty,

    #[error("Buffer allocation error: {0}")]
    AllocationError(String),
}

#[derive(Debug, Error)]
pub enum SinkError {
    #[error("Output sink is not open or initialized")]
    NotOpen,

    #[error("Output sink is already open")]
    AlreadyOpen,

    #[error("WAV sink error: {0}")]
    WavError(String),

    #[error("CPAL stream error: {0}")]
    CpalError(String),

    #[error("Audio device unavailable: {0}")]
    DeviceUnavailable(String),

    #[error("Sink I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Invalid sink state: {0}")]
    InvalidState(String),
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum StateError {
    #[error("Invalid state transition from {from} to {to}")]
    InvalidTransition { from: &'static str, to: &'static str },

    #[error("Slot {slot} has no primed or cued audio")]
    SlotNotPrimed { slot: &'static str },

    #[error("Operation timed out: {0}")]
    Timeout(String),
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum DeviceError {
    #[error("Audio device disconnected: {0}")]
    Disconnected(String),

    #[error("System default endpoint changed: {0}")]
    DefaultEndpointChanged(String),

    #[error("OS sleep/wake event invalidated audio stream session")]
    SessionInvalidated,

    #[error("Device does not support requested audio format: {0}")]
    UnsupportedFormat(String),
}
