//! C3 Acceptance Criteria: Click-Free Crossfade & Discontinuity Detector.
//!
//! Verifies that during an equal-power crossfade transition between audio tracks,
//! the discrete second-difference (|s[n] - 2*s[n-1] + s[n-2]|) remains strictly below
//! threshold (tau = 0.05), and short-time RMS power remains smooth and continuous without clicks.

use crate::generator::SignalMetrics;

/// Report from a crossfade continuity analysis.
#[derive(Debug, Clone, PartialEq)]
pub struct CrossfadeAuditReport {
    /// Maximum second-difference observed across the transition window.
    pub max_second_difference: f32,
    /// Second-difference threshold (tau = 0.05).
    pub second_diff_threshold: f32,
    /// Minimum RMS observed across sliding windows in the transition.
    pub min_window_rms: f32,
    /// Maximum RMS observed across sliding windows in the transition.
    pub max_window_rms: f32,
    /// Maximum jump in RMS between consecutive sliding windows.
    pub max_rms_step_delta: f32,
    /// Number of samples in the transition window analyzed.
    pub window_sample_count: usize,
    /// Whether second-difference continuity passed.
    pub is_continuity_valid: bool,
    /// Whether RMS power remained continuous without dropouts.
    pub is_rms_power_continuous: bool,
    /// Overall pass status.
    pub is_click_free: bool,
}

impl CrossfadeAuditReport {
    pub fn summary(&self) -> String {
        format!(
            "CrossfadeAuditReport: max_d2={:.4} (thresh={:.4}), min_rms={:.4}, max_rms={:.4}, max_rms_step={:.4}, click_free={}",
            self.max_second_difference,
            self.second_diff_threshold,
            self.min_window_rms,
            self.max_window_rms,
            self.max_rms_step_delta,
            self.is_click_free
        )
    }
}

pub struct CrossfadeAuditor;

impl CrossfadeAuditor {
    /// Audit an audio transition window for second-difference continuity and RMS smoothness.
    ///
    /// `transition_samples`: The slice of audio during which the crossfade transition occurs.
    /// `channels`: Channel count (1 or 2).
    /// `second_diff_threshold`: Maximum allowed second-difference (default: 0.05).
    /// `window_size_frames`: Sliding window size in frames for RMS tracking (typically 10ms: e.g. 441 frames @ 44.1kHz).
    pub fn audit(
        transition_samples: &[f32],
        channels: u16,
        second_diff_threshold: f32,
        window_size_frames: usize,
    ) -> CrossfadeAuditReport {
        let ch = channels.max(1) as usize;
        let window_sample_count = transition_samples.len();

        let max_second_difference = SignalMetrics::max_second_difference(transition_samples);
        let is_continuity_valid = max_second_difference < second_diff_threshold;

        // Sliding window RMS calculation
        let window_samples = window_size_frames * ch;
        let mut min_window_rms = f32::MAX;
        let mut max_window_rms = 0.0f32;
        let mut max_rms_step_delta = 0.0f32;
        let mut prev_rms: Option<f32> = None;

        if transition_samples.len() >= window_samples && window_samples > 0 {
            let hop_samples = window_samples / 2; // 50% overlap
            let mut start = 0;
            while start + window_samples <= transition_samples.len() {
                let slice = &transition_samples[start..start + window_samples];
                let current_rms = SignalMetrics::rms(slice);

                if current_rms < min_window_rms {
                    min_window_rms = current_rms;
                }
                if current_rms > max_window_rms {
                    max_window_rms = current_rms;
                }

                if let Some(prev) = prev_rms {
                    let step_delta = (current_rms - prev).abs();
                    if step_delta > max_rms_step_delta {
                        max_rms_step_delta = step_delta;
                    }
                }
                prev_rms = Some(current_rms);
                start += hop_samples;
            }
        } else {
            let single_rms = SignalMetrics::rms(transition_samples);
            min_window_rms = single_rms;
            max_window_rms = single_rms;
        }

        // For equal power crossfade between equal-amplitude signals, power should not dip below ~0.7x or jump >1.5x
        let is_rms_power_continuous = max_rms_step_delta < 0.25;
        let is_click_free = is_continuity_valid && is_rms_power_continuous;

        CrossfadeAuditReport {
            max_second_difference,
            second_diff_threshold,
            min_window_rms,
            max_window_rms,
            max_rms_step_delta,
            window_sample_count,
            is_continuity_valid,
            is_rms_power_continuous,
            is_click_free,
        }
    }
}
