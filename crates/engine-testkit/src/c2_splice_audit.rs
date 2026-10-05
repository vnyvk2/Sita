//! C2 Acceptance Criteria: Gapless Splice Boundary Auditor.
//!
//! Verifies that consecutive playback of split tracks with encoder delay and padding
//! trimming results in seamless concatenation that matches the continuous reference signal
//! with zero missing or duplicated samples across the boundary.

/// Report detailing the results of a gapless splice audit.
#[derive(Debug, Clone, PartialEq)]
pub struct SpliceAuditReport {
    /// Expected sample count from continuous reference signal.
    pub expected_samples: usize,
    /// Actual sample count produced by consecutive playback.
    pub actual_samples: usize,
    /// Absolute difference in sample count (missing or duplicated samples).
    pub sample_count_delta: isize,
    /// Maximum sample divergence across the entire concatenated signal.
    pub max_divergence: f32,
    /// Maximum divergence specifically in the splice boundary window (+/- 512 frames).
    pub boundary_window_max_divergence: f32,
    /// Sample index where the splice transition occurred.
    pub splice_index: usize,
    /// Whether the splice passed the gapless zero-loss criterion.
    pub is_seamless: bool,
}

impl SpliceAuditReport {
    pub fn summary(&self) -> String {
        format!(
            "SpliceAuditReport: expected={}, actual={}, delta={}, max_div={:.6e}, boundary_div={:.6e}, seamless={}",
            self.expected_samples,
            self.actual_samples,
            self.sample_count_delta,
            self.max_divergence,
            self.boundary_window_max_divergence,
            self.is_seamless
        )
    }
}

pub struct SpliceAuditor;

impl SpliceAuditor {
    /// Audit a concatenated playback stream against an uninterrupted reference signal.
    ///
    /// `splice_boundary_sample`: The exact sample index where Track 1 ends and Track 2 begins.
    /// `boundary_window_radius`: Number of samples around the splice point to inspect for boundary transients.
    pub fn audit(
        concatenated: &[f32],
        continuous_reference: &[f32],
        splice_boundary_sample: usize,
        boundary_window_radius: usize,
        max_allowed_error: f32,
    ) -> SpliceAuditReport {
        let expected_samples = continuous_reference.len();
        let actual_samples = concatenated.len();
        let sample_count_delta = (actual_samples as isize) - (expected_samples as isize);

        let compare_len = expected_samples.min(actual_samples);
        let mut max_divergence = 0.0f32;
        let mut boundary_window_max_divergence = 0.0f32;

        let window_start = splice_boundary_sample.saturating_sub(boundary_window_radius);
        let window_end = (splice_boundary_sample + boundary_window_radius).min(compare_len);

        for i in 0..compare_len {
            let diff = (concatenated[i] - continuous_reference[i]).abs();
            if diff > max_divergence {
                max_divergence = diff;
            }
            if i >= window_start && i < window_end && diff > boundary_window_max_divergence {
                boundary_window_max_divergence = diff;
            }
        }

        let is_seamless = sample_count_delta == 0
            && max_divergence <= max_allowed_error
            && boundary_window_max_divergence <= max_allowed_error;

        SpliceAuditReport {
            expected_samples,
            actual_samples,
            sample_count_delta,
            max_divergence,
            boundary_window_max_divergence,
            splice_index: splice_boundary_sample,
            is_seamless,
        }
    }
}
