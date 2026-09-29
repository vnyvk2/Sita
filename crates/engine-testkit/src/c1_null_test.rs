//! C1 Acceptance Criteria: Bit-Accurate Decode Null-Test Auditor.
//!
//! Verifies that rendered output from WavSink matches reference PCM
//! byte-for-byte / bit-for-bit (null difference == 0.0) in bypass mode.

/// Report detailing the results of a null-test audit.
#[derive(Debug, Clone, PartialEq)]
pub struct NullTestReport {
    /// Total number of samples evaluated.
    pub total_samples: usize,
    /// Absolute maximum difference between any pair of samples.
    pub max_diff: f32,
    /// Mean absolute difference across all samples.
    pub mean_diff: f64,
    /// Sum of absolute differences: sum |s_test[n] - s_ref[n]|.
    pub sum_abs_diff: f64,
    /// Number of samples that were not bit-identical.
    pub non_identical_samples: usize,
    /// Index of first differing sample, if any.
    pub first_divergence_index: Option<usize>,
    /// Whether the null-test passed strict bit-accurate criteria.
    pub is_null: bool,
}

impl NullTestReport {
    /// Formatted summary string for assertions and test diagnostics.
    pub fn summary(&self) -> String {
        format!(
            "NullTestReport: total={}, non_identical={}, max_diff={:.6e}, sum_abs_diff={:.6e}, is_null={}",
            self.total_samples, self.non_identical_samples, self.max_diff, self.sum_abs_diff, self.is_null
        )
    }
}

/// Bit-accurate decode null-test comparator.
pub struct NullTestAuditor;

impl NullTestAuditor {
    /// Perform a strict bit-accurate null-test comparison between rendered output and reference PCM.
    pub fn evaluate(test_samples: &[f32], ref_samples: &[f32]) -> NullTestReport {
        assert_eq!(
            test_samples.len(),
            ref_samples.len(),
            "Sample stream length mismatch: test={} vs ref={}",
            test_samples.len(),
            ref_samples.len()
        );

        let total_samples = test_samples.len();
        let mut max_diff = 0.0f32;
        let mut sum_abs_diff = 0.0f64;
        let mut non_identical_samples = 0usize;
        let mut first_divergence_index = None;

        for (idx, (&t, &r)) in test_samples.iter().zip(ref_samples.iter()).enumerate() {
            let diff = (t - r).abs();
            if diff > 0.0 {
                non_identical_samples += 1;
                if first_divergence_index.is_none() {
                    first_divergence_index = Some(idx);
                }
            }
            if diff > max_diff {
                max_diff = diff;
            }
            sum_abs_diff += diff as f64;
        }

        let mean_diff = if total_samples > 0 {
            sum_abs_diff / (total_samples as f64)
        } else {
            0.0
        };

        NullTestReport {
            total_samples,
            max_diff,
            mean_diff,
            sum_abs_diff,
            non_identical_samples,
            first_divergence_index,
            is_null: non_identical_samples == 0,
        }
    }

    /// Perform a null-test comparison with an allowable epsilon tolerance.
    pub fn evaluate_with_tolerance(
        test_samples: &[f32],
        ref_samples: &[f32],
        tolerance: f32,
    ) -> NullTestReport {
        let mut report = Self::evaluate(test_samples, ref_samples);
        report.is_null = report.max_diff <= tolerance;
        report
    }
}

/// Reads all 32-bit float samples from an existing WAV file via hound.
pub fn read_wav_f32_samples<P: AsRef<std::path::Path>>(
    path: P,
) -> Result<(hound::WavSpec, Vec<f32>), hound::Error> {
    let mut reader = hound::WavReader::open(path)?;
    let spec = reader.spec();
    let samples = match spec.sample_format {
        hound::SampleFormat::Float => reader.samples::<f32>().map(|s| s.unwrap()).collect(),
        hound::SampleFormat::Int => {
            let divisor = (1i64 << (spec.bits_per_sample - 1)) as f32;
            reader.samples::<i32>().map(|s| (s.unwrap() as f32) / divisor).collect()
        }
    };
    Ok((spec, samples))
}

/// Helper function running C1 null-test comparison between reference PCM and rendered PCM.
pub fn run_c1_null_test_on_pcm(
    reference: &[f32],
    rendered: &[f32],
    _sample_rate: u32,
    _channels: u16,
    tolerance: f32,
) -> Result<NullTestReport, String> {
    if reference.len() != rendered.len() {
        return Err(format!(
            "Sample count mismatch: reference={}, rendered={}",
            reference.len(),
            rendered.len()
        ));
    }
    Ok(NullTestAuditor::evaluate_with_tolerance(rendered, reference, tolerance))
}

