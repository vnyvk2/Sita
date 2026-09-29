//! Pluggable audio sink backends: offline rendering (WavSink), headless soak (NullSink), and live audio (CpalBackend).

pub mod wav;
pub mod null;
pub mod cpal;

pub use wav::WavSink;
pub use null::NullSink;
pub use cpal::CpalBackend;

use crate::types::{AudioSpec, BackendStats, SinkError};

/// Pluggable audio output backend lifecycle contract.
pub trait OutputBackend: Send {
    /// Open and configure the output backend with the specified audio format.
    fn open(&mut self, spec: AudioSpec) -> Result<(), SinkError>;

    /// Start or resume audio playback / consumption.
    fn start(&mut self) -> Result<(), SinkError>;

    /// Pause audio playback / consumption.
    /// For real-time hardware backends, this must emit continuous silence without dropping stream handles.
    fn pause(&mut self) -> Result<(), SinkError>;

    /// Stop playback and finalize outputs (e.g. flushing buffers and finalizing WAV headers).
    fn stop(&mut self) -> Result<(), SinkError>;

    /// Retrieve an instantaneous snapshot of backend telemetry statistics.
    fn stats(&self) -> BackendStats;

    /// Returns true if the sink is initialized and open.
    fn is_open(&self) -> bool;

    /// Returns true if the sink is actively running (started and not paused).
    fn is_running(&self) -> bool;
}

/// Real-time sample generator interface providing interleaved f32 audio.
/// Guaranteed to execute with zero allocations, zero mutexes, zero syscalls, and no panics.
pub trait AudioSource: Send {
    /// Render up to `output.len()` interleaved f32 samples into the destination buffer.
    /// Returns the number of valid samples written.
    fn render(&mut self, output: &mut [f32]) -> usize;
}
