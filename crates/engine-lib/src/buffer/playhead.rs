//! Sample-accurate monotonic playhead tracking.
//!
//! Computes playback position strictly from atomic counters of frames consumed
//! by the output backend, eliminating wall-clock drift across underruns, pauses, and sleep.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use crate::types::{AudioSpec, SharedSinkStats};

/// Sample-accurate monotonic playhead tracker.
pub struct PlayheadTracker {
    base_frame_offset: AtomicU64,
    spec: AudioSpec,
    stats: Arc<SharedSinkStats>,
}

impl PlayheadTracker {
    /// Construct a new playhead tracker bound to the backend's shared telemetry.
    pub fn new(spec: AudioSpec, stats: Arc<SharedSinkStats>) -> Self {
        Self {
            base_frame_offset: AtomicU64::new(0),
            spec,
            stats,
        }
    }

    /// Retrieve the current playback position in audio frames.
    #[inline]
    pub fn position_frames(&self) -> u64 {
        let base = self.base_frame_offset.load(Ordering::Relaxed);
        let consumed = self.stats.total_frames.load(Ordering::Relaxed);
        base.saturating_add(consumed)
    }

    /// Retrieve the current playback position in fractional seconds.
    #[inline]
    pub fn position_seconds(&self) -> f64 {
        let frames = self.position_frames();
        self.spec.frames_to_seconds(frames)
    }

    /// Retrieve the current playback position as a standard Duration.
    #[inline]
    pub fn position_duration(&self) -> Duration {
        let frames = self.position_frames();
        self.spec.frames_to_duration(frames)
    }

    /// Update the base frame offset on seek.
    ///
    /// CALLER MUST QUIESCE the audio callback (pause mixer / hold the mixer
    /// lock) before invoking: the reset is two atomic stores and a concurrent
    /// `fetch_add` from the RT thread would otherwise double-count or drop an
    /// increment (torn seek).
    pub fn set_seek_target_frame(&self, target_frame: u64) {
        self.stats.total_frames.store(0, Ordering::SeqCst);
        self.stats.total_samples.store(0, Ordering::SeqCst);
        self.base_frame_offset.store(target_frame, Ordering::SeqCst);
        // Fresh telemetry segment: stale minima would otherwise poison
        // post-seek underrun reporting.
        self.stats.low_water_mark.store(usize::MAX, Ordering::Relaxed);
        self.stats.xrun_count.store(0, Ordering::Relaxed);
    }
}
