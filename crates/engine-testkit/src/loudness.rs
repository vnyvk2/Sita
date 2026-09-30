//! ITU-R BS.1770-4 / EBU R128 Loudness and Loudness Range (LRA) measurement.
//!
//! Implements:
//! - Dual-stage K-weighting filter (Stage 1 high-shelf + Stage 2 RLB high-pass).
//! - 400ms rectangular window with 100ms hop (75% overlap).
//! - Dual-gating per ITU-R BS.1770-4 (Absolute threshold -70 LUFS, Relative threshold -10 LU).
//! - EBU R128 Loudness Range (LRA) across 10th to 95th percentiles of short-term loudness.

/// ITU-R BS.1770-4 K-weighting biquad filter.
#[derive(Debug, Clone)]
struct Biquad {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
    x1: f64,
    x2: f64,
    y1: f64,
    y2: f64,
}

impl Biquad {
    fn new(b: [f64; 3], a: [f64; 3]) -> Self {
        Self {
            b0: b[0] / a[0],
            b1: b[1] / a[0],
            b2: b[2] / a[0],
            a1: a[1] / a[0],
            a2: a[2] / a[0],
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
        }
    }

    #[inline]
    fn process(&mut self, x0: f64) -> f64 {
        let y0 = self.b0 * x0 + self.b1 * self.x1 + self.b2 * self.x2
            - self.a1 * self.y1
            - self.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = x0;
        self.y2 = self.y1;
        self.y1 = y0;
        y0
    }
}

/// Computes K-weighting filter coefficients for a given sample rate.
fn k_weighting_coefficients(sample_rate: f64) -> ([f64; 3], [f64; 3], [f64; 3], [f64; 3]) {
    // Stage 1: High-shelf filter (head model)
    let db1 = 3.999843853973347f64;
    let f0_1 = 1681.974450955533f64;
    let q1 = 0.7071752369554196f64;
    let k1 = (std::f64::consts::PI * f0_1 / sample_rate).tan();
    let vh = 10.0f64.powf(db1 / 20.0);
    let vb = vh.powf(0.4996667741545416);
    let a0_1 = 1.0 + k1 / q1 + k1 * k1;
    let b1 = [
        (vh + (vb * k1) / q1 + k1 * k1) / a0_1,
        (2.0 * (k1 * k1 - vh)) / a0_1,
        (vh - (vb * k1) / q1 + k1 * k1) / a0_1,
    ];
    let a1 = [
        1.0,
        (2.0 * (k1 * k1 - 1.0)) / a0_1,
        (1.0 - k1 / q1 + k1 * k1) / a0_1,
    ];

    // Stage 2: High-pass filter (RLB weighting)
    let f0_2 = 38.13547087602444f64;
    let q2 = 0.5003270373238773f64;
    let k2 = (std::f64::consts::PI * f0_2 / sample_rate).tan();
    let a0_2 = 1.0 + k2 / q2 + k2 * k2;
    let b2 = [1.0 / a0_2, -2.0 / a0_2, 1.0 / a0_2];
    let a2 = [
        1.0,
        (2.0 * (k2 * k2 - 1.0)) / a0_2,
        (1.0 - k2 / q2 + k2 * k2) / a0_2,
    ];

    (b1, a1, b2, a2)
}

/// Loudness measurement results according to ITU-R BS.1770-4 and EBU R128.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LoudnessMetrics {
    /// Integrated loudness in LUFS.
    pub integrated_lufs: f64,
    /// Loudness range in LU (EBU R128).
    pub lra_lu: f64,
    /// Absolute peak linear amplitude.
    pub peak_linear: f32,
    /// Absolute peak in dBFS.
    pub peak_dbfs: f32,
    /// RMS linear amplitude.
    pub rms_linear: f32,
    /// RMS in dBFS.
    pub rms_dbfs: f32,
}

/// Compute ITU-R BS.1770-4 Integrated Loudness and EBU R128 LRA for stereo interleaved audio.
pub fn measure_loudness(interleaved_stereo: &[f32], sample_rate: u32) -> LoudnessMetrics {
    let num_frames = interleaved_stereo.len() / 2;
    if num_frames == 0 {
        return LoudnessMetrics {
            integrated_lufs: -120.0,
            lra_lu: 0.0,
            peak_linear: 0.0,
            peak_dbfs: -120.0,
            rms_linear: 0.0,
            rms_dbfs: -120.0,
        };
    }

    let sr = sample_rate as f64;
    let (b1, a1, b2, a2) = k_weighting_coefficients(sr);

    let mut bq1_l = Biquad::new(b1, a1);
    let mut bq2_l = Biquad::new(b2, a2);
    let mut bq1_r = Biquad::new(b1, a1);
    let mut bq2_r = Biquad::new(b2, a2);

    let mut k_l = Vec::with_capacity(num_frames);
    let mut k_r = Vec::with_capacity(num_frames);

    let mut max_peak = 0.0f32;
    let mut sum_sq = 0.0f64;

    for chunk in interleaved_stereo.chunks_exact(2) {
        let l = chunk[0];
        let r = chunk[1];
        max_peak = max_peak.max(l.abs()).max(r.abs());
        sum_sq += (l as f64 * l as f64 + r as f64 * r as f64) * 0.5;

        let filtered_l = bq2_l.process(bq1_l.process(l as f64));
        let filtered_r = bq2_r.process(bq1_r.process(r as f64));
        k_l.push(filtered_l);
        k_r.push(filtered_r);
    }

    let peak_db = if max_peak > 0.0 {
        20.0 * max_peak.log10()
    } else {
        -120.0
    };
    let rms_lin = ((sum_sq / (num_frames as f64)).sqrt()) as f32;
    let rms_db = if rms_lin > 0.0 {
        20.0 * rms_lin.log10()
    } else {
        -120.0
    };

    // 400ms block, 100ms hop
    let block_size = (0.4 * sr).floor() as usize;
    let hop_size = (0.1 * sr).floor() as usize;

    if num_frames < block_size {
        // Fallback for sub-400ms buffers: compute un-gated energy
        let mut energy = 0.0f64;
        for i in 0..num_frames {
            energy += k_l[i] * k_l[i] + k_r[i] * k_r[i];
        }
        let mean_sq = energy / ((num_frames * 2) as f64);
        let lufs = if mean_sq > 1e-12 {
            -0.691 + 10.0 * mean_sq.log10()
        } else {
            -120.0
        };
        return LoudnessMetrics {
            integrated_lufs: lufs,
            lra_lu: 0.0,
            peak_linear: max_peak,
            peak_dbfs: peak_db,
            rms_linear: rms_lin,
            rms_dbfs: rms_db,
        };
    }

    let num_blocks = (num_frames - block_size) / hop_size;
    let mut block_powers = Vec::with_capacity(num_blocks);
    let mut short_term_lufs = Vec::with_capacity(num_blocks);

    for b in 0..num_blocks {
        let start = b * hop_size;
        let mut sum = 0.0f64;
        for i in 0..block_size {
            sum += k_l[start + i] * k_l[start + i] + k_r[start + i] * k_r[start + i];
        }
        let mean_sq = sum / ((block_size * 2) as f64);
        block_powers.push(mean_sq);
        if mean_sq > 0.0 {
            short_term_lufs.push(-0.691 + 10.0 * mean_sq.log10());
        }
    }

    // Absolute threshold gating at -70.0 LUFS
    let mut abs_gated = Vec::new();
    for &z in &block_powers {
        if z > 0.0 && (-0.691 + 10.0 * z.log10()) >= -70.0 {
            abs_gated.push(z);
        }
    }

    let mut integrated = -120.0f64;
    if !abs_gated.is_empty() {
        let ungated_mean: f64 = abs_gated.iter().sum::<f64>() / (abs_gated.len() as f64);
        let rel_threshold = -0.691 + 10.0 * ungated_mean.log10() - 10.0;

        let mut rel_gated = Vec::new();
        for &z in &abs_gated {
            if (-0.691 + 10.0 * z.log10()) >= rel_threshold {
                rel_gated.push(z);
            }
        }

        if !rel_gated.is_empty() {
            let gated_mean: f64 = rel_gated.iter().sum::<f64>() / (rel_gated.len() as f64);
            integrated = -0.691 + 10.0 * gated_mean.log10();
        }
    }

    // EBU R128 LRA across short-term blocks (10th percentile to 95th percentile)
    let mut lra = 0.0f64;
    if short_term_lufs.len() > 5 {
        short_term_lufs.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let low_idx = (short_term_lufs.len() as f64 * 0.10).floor() as usize;
        let high_idx = (short_term_lufs.len() as f64 * 0.95).floor() as usize;
        let high_idx = high_idx.min(short_term_lufs.len() - 1);
        lra = short_term_lufs[high_idx] - short_term_lufs[low_idx];
    }

    LoudnessMetrics {
        integrated_lufs: integrated,
        lra_lu: lra,
        peak_linear: max_peak,
        peak_dbfs: peak_db,
        rms_linear: rms_lin,
        rms_dbfs: rms_db,
    }
}
