//! Windowed-sinc (FFT) stereo resampling for the decode pump.
//!
//! Rate policy: the engine renders at the output device rate
//! (see `EngineConfig`/daemon docs). File content at any other rate is
//! resampled here with rubato's FFT sinc interpolator — strictly better than
//! first-order linear hold, whose imaging lands in the audible band when
//! upsampling 44.1 kHz content to 48 kHz.
//!
//! Runs on the background decoder thread (NOT the RT callback), so the
//! per-call allocations below are permissible.

use rubato::{FftFixedInOut, Resampler};

/// Fixed input chunk in frames. Large enough for FFT efficiency, small enough
/// to keep decode→playback latency low.
const CHUNK_FRAMES_IN: usize = 1024;

/// Streaming stereo resampler wrapping rubato's fixed-chunk FFT resampler.
///
/// Accepts arbitrary-length interleaved slices, buffers partial chunks
/// internally, and emits resampled interleaved stereo. `flush()` drains the
/// tail with zero-padding truncated to the exact expected length.
pub struct StereoResampler {
    inner: Option<FftFixedInOut<f32>>,
    chunk_frames: usize,
    pending_l: Vec<f32>,
    pending_r: Vec<f32>,
    total_in_frames: u64,
    total_out_frames: u64,
    out_rate: u32,
    in_rate: u32,
}

impl StereoResampler {
    /// Create a resampler from `in_rate` to `out_rate`.
    /// Equal rates yield a passthrough (no resampler constructed).
    pub fn new(in_rate: u32, out_rate: u32) -> Result<Self, String> {
        let (inner, chunk_frames) = if in_rate == out_rate {
            (None, 0)
        } else {
            let resampler = FftFixedInOut::<f32>::new(
                in_rate as usize,
                out_rate as usize,
                CHUNK_FRAMES_IN,
                2,
            )
            .map_err(|e| format!("rubato construction failed: {e}"))?;
            // FFT overlap needs slightly more than the nominal chunk (e.g.
            // 1029 in-frames for 44.1k -> 48k); always ask the resampler.
            let need = rubato::Resampler::input_frames_next(&resampler);
            (Some(resampler), need)
        };
        Ok(Self {
            inner,
            chunk_frames,
            pending_l: Vec::new(),
            pending_r: Vec::new(),
            total_in_frames: 0,
            total_out_frames: 0,
            out_rate,
            in_rate,
        })
    }

    /// Returns true when no resampling takes place (bit-exact passthrough).
    pub fn is_passthrough(&self) -> bool {
        self.inner.is_none()
    }

    /// Fixed filter latency in output frames. The first `output_delay()`
    /// frames of the stream are filter warmup (near-zero), not content —
    /// callers doing sample-exact comparisons (and the daemon at track
    /// starts) must account for this.
    pub fn output_delay(&self) -> usize {
        self.inner
            .as_ref()
            .map(rubato::Resampler::output_delay)
            .unwrap_or(0)
    }

    /// Push interleaved stereo samples; resampled output is appended to `out`.
    pub fn push_interleaved(
        &mut self,
        samples: &[f32],
        out: &mut Vec<f32>,
    ) -> Result<(), String> {
        if samples.len() % 2 != 0 {
            return Err("odd-length interleaved chunk cannot form stereo frames".to_string());
        }
        let Some(inner) = self.inner.as_mut() else {
            out.extend_from_slice(samples);
            self.total_in_frames += (samples.len() / 2) as u64;
            self.total_out_frames = self.total_in_frames;
            return Ok(());
        };

        for chunk in samples.chunks_exact(2) {
            self.pending_l.push(chunk[0]);
            self.pending_r.push(chunk[1]);
        }
        self.total_in_frames += (samples.len() / 2) as u64;

        while self.pending_l.len() >= self.chunk_frames {
            let in_l: Vec<f32> = self.pending_l.drain(..self.chunk_frames).collect();
            let in_r: Vec<f32> = self.pending_r.drain(..self.chunk_frames).collect();
            let frames = inner
                .process(&[in_l, in_r], None)
                .map_err(|e| format!("rubato process failed: {e}"))?;
            debug_assert_eq!(frames.len(), 2);
            for (l, r) in frames[0].iter().zip(frames[1].iter()) {
                out.push(*l);
                out.push(*r);
            }
            self.total_out_frames += frames[0].len() as u64;
        }
        Ok(())
    }

    /// Drain buffered tail. Zero-pads the final partial chunk, then truncates
    /// to the exact expected output length so file duration stays exact.
    pub fn flush(&mut self, out: &mut Vec<f32>) -> Result<(), String> {
        let Some(inner) = self.inner.as_mut() else {
            return Ok(());
        };
        if self.pending_l.is_empty() {
            return Ok(());
        }
        let expected_total =
            ((self.total_in_frames as f64) * (self.out_rate as f64) / (self.in_rate as f64)).round()
                as u64;
        while self.pending_l.len() < self.chunk_frames {
            self.pending_l.push(0.0);
            self.pending_r.push(0.0);
        }
        let in_l: Vec<f32> = self.pending_l.drain(..self.chunk_frames).collect();
        let in_r: Vec<f32> = self.pending_r.drain(..self.chunk_frames).collect();
        let frames = inner
            .process(&[in_l, in_r], None)
            .map_err(|e| format!("rubato flush failed: {e}"))?;
        let remaining = expected_total.saturating_sub(self.total_out_frames) as usize;
        let take = remaining.min(frames[0].len());
        for (l, r) in frames[0].iter().zip(frames[1].iter()).take(take) {
            out.push(*l);
            out.push(*r);
        }
        self.total_out_frames += take as u64;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passthrough_preserves_bits() {
        let mut r = StereoResampler::new(48000, 48000).unwrap();
        assert!(r.is_passthrough());
        let mut out = Vec::new();
        r.push_interleaved(&[0.5, -0.5, 0.25, 0.75], &mut out).unwrap();
        assert_eq!(out, vec![0.5, -0.5, 0.25, 0.75]);
    }

    #[test]
    fn resample_44100_to_48000_length_exact() {
        let mut r = StereoResampler::new(44100, 48000).unwrap();
        // 1 second of 44.1kHz stereo silence across odd-sized pushes.
        let mut out = Vec::new();
        let chunk = vec![0.0f32; 1000];
        for _ in 0..88 {
            r.push_interleaved(&chunk, &mut out).unwrap();
        }
        r.push_interleaved(&vec![0.0f32; 200], &mut out).unwrap();
        r.flush(&mut out).unwrap();
        assert_eq!(out.len(), 48000 * 2);
    }

    #[test]
    fn odd_chunk_rejected() {
        let mut r = StereoResampler::new(44100, 48000).unwrap();
        let mut out = Vec::new();
        assert!(r.push_interleaved(&[1.0, 2.0, 3.0], &mut out).is_err());
    }

    fn sine_rms(rate: u32, freq: f32, secs: f32) -> (Vec<f32>, f64) {
        let n = (rate as f32 * secs) as usize;
        // Phase computed in f64: f32 phase quantization alone would floor the
        // measurement near -60 dB and mask the true resampler SNR.
        let pcm: Vec<f32> = (0..n)
            .flat_map(|i| {
                let s = (2.0 * std::f64::consts::PI * freq as f64 * i as f64 / rate as f64).sin()
                    * 0.8;
                [s as f32, s as f32]
            })
            .collect();
        let rms = (pcm.iter().map(|s| (*s as f64).powi(2)).sum::<f64>() / pcm.len() as f64).sqrt();
        (pcm, rms)
    }

    /// Signal-to-noise ratio of the resampler at 1 kHz, 44.1 → 48 kHz.
    /// The reference is evaluated ANALYTICALLY (f64 sine at exact fractional
    /// times), so no interpolation error pollutes the measurement; the single
    /// fitted parameter is the (possibly fractional) filter delay. What
    /// remains after the fit is imaging and aliasing — exactly the energy
    /// linear hold sprays out of band.
    #[test]
    fn snr_at_1khz_exceeds_90db() {
        let (pcm, _) = sine_rms(44100, 1000.0, 1.0);
        let mut r = StereoResampler::new(44100, 48000).unwrap();
        let mut out = Vec::new();
        for chunk in pcm.chunks(4096) {
            let even = chunk.len() - chunk.len() % 2;
            r.push_interleaved(&chunk[..even], &mut out).unwrap();
        }
        r.flush(&mut out).unwrap();

        let out_frames = out.len() / 2;
        let left: Vec<f32> = out.chunks_exact(2).map(|c| c[0]).collect();
        // Steady state only: skip warmup at the head and flush tail.
        let lo = 3000usize;
        let hi = out_frames.saturating_sub(4000);
        let tone =
            |t_frames: f64| 0.8 * (2.0 * std::f64::consts::PI * 1000.0 * t_frames / 48000.0).sin();
        // Fit fractional delay on a fine grid, then refine parabolically:
        // a bare 0.1-frame grid caps unrefined fits near -44 dB (0.05-frame
        // worst misfit on a 1 kHz tone), which would misattribute measurement
        // granularity to the resampler.
        let err_at = |d: f64| {
            let mut sum = 0.0f64;
            let mut n = 0usize;
            let mut i = lo;
            while i < hi {
                let diff = left[i] as f64 - tone(i as f64 - d);
                sum += diff * diff;
                n += 1;
                i += 7;
            }
            sum / n as f64
        };
        let mut best = (0.0f64, f64::INFINITY);
        let mut d = 500.0;
        while d < 700.0 {
            let resid = err_at(d);
            if resid < best.1 {
                best = (d, resid);
            }
            d += 0.1;
        }
        let (e0, e1, e2) = (err_at(best.0 - 0.1), best.1, err_at(best.0 + 0.1));
        let denom = e0 - 2.0 * e1 + e2;
        let d_star = if denom > 0.0 { best.0 - 0.05 * (e2 - e0) / denom } else { best.0 };
        let resid = err_at(d_star);
        let tone_power = 0.8f64.powi(2) / 2.0;
        let snr_db = 10.0 * (tone_power / resid).log10();
        assert!(snr_db >= 90.0, "resampler SNR {snr_db:.1} dB below 90 dB");
    }

    /// 44.1 → 192 kHz (4.34:1) stresses the FFT stage differently than
    /// 44.1 → 48 kHz — this is the DAC-session ratio, so it gets its own case.
    #[test]
    fn upsample_44100_to_192000_length_and_level() {
        let (pcm, in_rms) = sine_rms(44100, 1000.0, 0.5);
        let mut r = StereoResampler::new(44100, 192000).unwrap();
        let mut out = Vec::new();
        for chunk in pcm.chunks(4096) {
            let even = chunk.len() - chunk.len() % 2;
            r.push_interleaved(&chunk[..even], &mut out).unwrap();
        }
        r.flush(&mut out).unwrap();
        let expected = (22050.0f64 * 192000.0 / 44100.0).round() as usize * 2;
        assert_eq!(out.len(), expected);
        let mid = &out[out.len() / 10..out.len() * 9 / 10];
        let out_rms =
            (mid.iter().map(|s| (*s as f64).powi(2)).sum::<f64>() / mid.len() as f64).sqrt();
        assert!((out_rms - in_rms).abs() / in_rms < 0.02);
    }

    #[test]
    fn sinc_preserves_tone_amplitude_44100_to_48000() {
        // 15 kHz tone near the Nyquist edge: first-order linear hold audibly
        // dulls/aliases here; windowed-sinc must preserve RMS within 2%.
        let (pcm, in_rms) = sine_rms(44100, 15000.0, 1.0);
        let mut r = StereoResampler::new(44100, 48000).unwrap();
        let mut out = Vec::new();
        for chunk in pcm.chunks(2048) {
            // chunks() may yield odd tail; feed frame-aligned slices only.
            let even = chunk.len() - chunk.len() % 2;
            r.push_interleaved(&chunk[..even], &mut out).unwrap();
        }
        r.flush(&mut out).unwrap();
        assert_eq!(out.len(), 48000 * 2);
        let out_rms =
            (out.iter().map(|s| (*s as f64).powi(2)).sum::<f64>() / out.len() as f64).sqrt();
        let drift = (out_rms - in_rms).abs() / in_rms;
        assert!(drift < 0.02, "sinc RMS drift {drift:.4} exceeds 2%");
    }

    #[test]
    fn downsample_48000_to_44100_length_and_level() {        let (pcm, in_rms) = sine_rms(48000, 1000.0, 0.5);
        let mut r = StereoResampler::new(48000, 44100).unwrap();
        let mut out = Vec::new();
        r.push_interleaved(&pcm, &mut out).unwrap();
        r.flush(&mut out).unwrap();
        assert_eq!(out.len(), 22050 * 2);
        // Compare the middle 80%: FFT edge warmup + zero-pad flush make the
        // first/last chunks unrepresentative of steady-state level.
        let mid = &out[out.len() / 10..out.len() * 9 / 10];
        let out_rms =
            (mid.iter().map(|s| (*s as f64).powi(2)).sum::<f64>() / mid.len() as f64).sqrt();
        assert!((out_rms - in_rms).abs() / in_rms < 0.01);
    }
}
