//! Deterministic synthetic audio generators for the Nora Audio Engine testkit.
//!
//! Provides mathematically precise signal generation for sine waves, square waves,
//! impulses, sweeps, silence, and deterministic noise, supporting both mono and multi-channel
//! interleaved layouts.

use std::f32::consts::PI;

/// Trait implemented by all synthetic signal generators.
pub trait SignalGenerator {
    /// Render the specified number of interleaved samples into a vector.
    fn generate_samples(&mut self, sample_count: usize) -> Vec<f32>;

    /// Render a specific duration into interleaved samples.
    fn generate_duration(&mut self, duration_secs: f64) -> Vec<f32>;

    /// Fill an existing pre-allocated slice with samples.
    fn fill_slice(&mut self, buffer: &mut [f32]);
}

/// Deterministic sine wave generator.
#[derive(Debug, Clone)]
pub struct SineGenerator {
    pub frequency: f32,
    pub sample_rate: u32,
    pub amplitude: f32,
    pub phase: f32,
    pub channels: u16,
    current_frame: u64,
}

impl SineGenerator {
    pub fn new(frequency: f32, sample_rate: u32, amplitude: f32, channels: u16) -> Self {
        Self {
            frequency,
            sample_rate,
            amplitude,
            phase: 0.0,
            channels,
            current_frame: 0,
        }
    }

    pub fn with_phase(mut self, phase_rad: f32) -> Self {
        self.phase = phase_rad;
        self
    }

    /// Reset internal time counter to zero.
    pub fn reset(&mut self) {
        self.current_frame = 0;
    }

    /// Sample-rate step size in radians.
    #[inline]
    fn phase_increment(&self) -> f32 {
        2.0 * PI * self.frequency / (self.sample_rate as f32)
    }
}

impl SignalGenerator for SineGenerator {
    fn fill_slice(&mut self, buffer: &mut [f32]) {
        let ch = self.channels.max(1) as usize;
        let inc = self.phase_increment();

        for chunk in buffer.chunks_exact_mut(ch) {
            let theta = (self.current_frame as f32) * inc + self.phase;
            let sample = self.amplitude * theta.sin();
            for out in chunk.iter_mut() {
                *out = sample;
            }
            self.current_frame += 1;
        }
    }

    fn generate_samples(&mut self, sample_count: usize) -> Vec<f32> {
        let mut buffer = vec![0.0f32; sample_count];
        self.fill_slice(&mut buffer);
        buffer
    }

    fn generate_duration(&mut self, duration_secs: f64) -> Vec<f32> {
        let total_frames = (duration_secs * (self.sample_rate as f64)).round() as usize;
        let total_samples = total_frames * (self.channels.max(1) as usize);
        self.generate_samples(total_samples)
    }
}

/// Deterministic square wave generator with configurable duty cycle.
#[derive(Debug, Clone)]
pub struct SquareGenerator {
    pub frequency: f32,
    pub sample_rate: u32,
    pub amplitude: f32,
    pub duty_cycle: f32,
    pub channels: u16,
    current_frame: u64,
}

impl SquareGenerator {
    pub fn new(frequency: f32, sample_rate: u32, amplitude: f32, channels: u16) -> Self {
        Self {
            frequency,
            sample_rate,
            amplitude,
            duty_cycle: 0.5,
            channels,
            current_frame: 0,
        }
    }

    pub fn with_duty_cycle(mut self, duty: f32) -> Self {
        self.duty_cycle = duty.clamp(0.0, 1.0);
        self
    }
}

impl SignalGenerator for SquareGenerator {
    fn fill_slice(&mut self, buffer: &mut [f32]) {
        let ch = self.channels.max(1) as usize;
        let period_frames = (self.sample_rate as f32 / self.frequency.max(1.0)).max(1.0);
        let high_frames = period_frames * self.duty_cycle;

        for chunk in buffer.chunks_exact_mut(ch) {
            let pos = (self.current_frame as f32) % period_frames;
            let sample = if pos < high_frames {
                self.amplitude
            } else {
                -self.amplitude
            };
            for out in chunk.iter_mut() {
                *out = sample;
            }
            self.current_frame += 1;
        }
    }

    fn generate_samples(&mut self, sample_count: usize) -> Vec<f32> {
        let mut buffer = vec![0.0f32; sample_count];
        self.fill_slice(&mut buffer);
        buffer
    }

    fn generate_duration(&mut self, duration_secs: f64) -> Vec<f32> {
        let total_frames = (duration_secs * (self.sample_rate as f64)).round() as usize;
        let total_samples = total_frames * (self.channels.max(1) as usize);
        self.generate_samples(total_samples)
    }
}

/// Deterministic periodic impulse train or Dirac delta generator.
#[derive(Debug, Clone)]
pub struct ImpulseGenerator {
    pub period_frames: usize,
    pub sample_rate: u32,
    pub amplitude: f32,
    pub channels: u16,
    current_frame: usize,
}

impl ImpulseGenerator {
    pub fn new(period_frames: usize, sample_rate: u32, amplitude: f32, channels: u16) -> Self {
        Self {
            period_frames: period_frames.max(1),
            sample_rate,
            amplitude,
            channels,
            current_frame: 0,
        }
    }

    /// Single Dirac delta at frame 0.
    pub fn single_delta(sample_rate: u32, amplitude: f32, channels: u16) -> Self {
        Self {
            period_frames: usize::MAX,
            sample_rate,
            amplitude,
            channels,
            current_frame: 0,
        }
    }
}

impl SignalGenerator for ImpulseGenerator {
    fn fill_slice(&mut self, buffer: &mut [f32]) {
        let ch = self.channels.max(1) as usize;
        for chunk in buffer.chunks_exact_mut(ch) {
            let sample = if self.current_frame % self.period_frames == 0 {
                self.amplitude
            } else {
                0.0
            };
            for out in chunk.iter_mut() {
                *out = sample;
            }
            self.current_frame = self.current_frame.saturating_add(1);
        }
    }

    fn generate_samples(&mut self, sample_count: usize) -> Vec<f32> {
        let mut buffer = vec![0.0f32; sample_count];
        self.fill_slice(&mut buffer);
        buffer
    }

    fn generate_duration(&mut self, duration_secs: f64) -> Vec<f32> {
        let total_frames = (duration_secs * (self.sample_rate as f64)).round() as usize;
        let total_samples = total_frames * (self.channels.max(1) as usize);
        self.generate_samples(total_samples)
    }
}

/// Continuous digital silence generator (all samples strictly 0.0f32).
#[derive(Debug, Clone)]
pub struct SilenceGenerator {
    pub sample_rate: u32,
    pub channels: u16,
}

impl SilenceGenerator {
    pub fn new(sample_rate: u32, channels: u16) -> Self {
        Self {
            sample_rate,
            channels,
        }
    }
}

impl SignalGenerator for SilenceGenerator {
    fn fill_slice(&mut self, buffer: &mut [f32]) {
        buffer.fill(0.0);
    }

    fn generate_samples(&mut self, sample_count: usize) -> Vec<f32> {
        vec![0.0f32; sample_count]
    }

    fn generate_duration(&mut self, duration_secs: f64) -> Vec<f32> {
        let total_frames = (duration_secs * (self.sample_rate as f64)).round() as usize;
        let total_samples = total_frames * (self.channels.max(1) as usize);
        vec![0.0f32; total_samples]
    }
}

/// Linear frequency sweep / chirp generator.
#[derive(Debug, Clone)]
pub struct SweepGenerator {
    pub start_freq: f32,
    pub end_freq: f32,
    pub sweep_duration_secs: f64,
    pub sample_rate: u32,
    pub amplitude: f32,
    pub channels: u16,
    current_frame: u64,
}

impl SweepGenerator {
    pub fn new(
        start_freq: f32,
        end_freq: f32,
        sweep_duration_secs: f64,
        sample_rate: u32,
        amplitude: f32,
        channels: u16,
    ) -> Self {
        Self {
            start_freq,
            end_freq,
            sweep_duration_secs: sweep_duration_secs.max(0.001),
            sample_rate,
            amplitude,
            channels,
            current_frame: 0,
        }
    }
}

impl SignalGenerator for SweepGenerator {
    fn fill_slice(&mut self, buffer: &mut [f32]) {
        let ch = self.channels.max(1) as usize;
        let total_sweep_frames = (self.sweep_duration_secs * self.sample_rate as f64) as f32;
        let f0 = self.start_freq;
        let f1 = self.end_freq;
        let k = (f1 - f0) / total_sweep_frames;

        for chunk in buffer.chunks_exact_mut(ch) {
            let t = (self.current_frame as f32) / (self.sample_rate as f32);
            let frame = self.current_frame as f32;
            let instantaneous_phase = 2.0 * PI * (f0 * t + 0.5 * k * (frame * frame) / (self.sample_rate as f32));
            let sample = self.amplitude * instantaneous_phase.sin();
            for out in chunk.iter_mut() {
                *out = sample;
            }
            self.current_frame += 1;
        }
    }

    fn generate_samples(&mut self, sample_count: usize) -> Vec<f32> {
        let mut buffer = vec![0.0f32; sample_count];
        self.fill_slice(&mut buffer);
        buffer
    }

    fn generate_duration(&mut self, duration_secs: f64) -> Vec<f32> {
        let total_frames = (duration_secs * (self.sample_rate as f64)).round() as usize;
        let total_samples = total_frames * (self.channels.max(1) as usize);
        self.generate_samples(total_samples)
    }
}

/// Deterministic pseudo-random white noise generator using a linear congruential generator (LCG).
#[derive(Debug, Clone)]
pub struct DeterministicNoiseGenerator {
    pub sample_rate: u32,
    pub amplitude: f32,
    pub channels: u16,
    state: u64,
}

impl DeterministicNoiseGenerator {
    pub fn new(seed: u64, sample_rate: u32, amplitude: f32, channels: u16) -> Self {
        Self {
            sample_rate,
            amplitude,
            channels,
            state: seed.max(1),
        }
    }

    #[inline]
    fn next_f32(&mut self) -> f32 {
        // Numerical Recipes 64-bit LCG
        self.state = self.state.wrapping_mul(2862933555777941757).wrapping_add(3037000493);
        // Map top 32 bits to [-1.0, 1.0]
        let val = ((self.state >> 32) as u32) as f64 / (u32::MAX as f64);
        (val * 2.0 - 1.0) as f32
    }
}

impl SignalGenerator for DeterministicNoiseGenerator {
    fn fill_slice(&mut self, buffer: &mut [f32]) {
        let ch = self.channels.max(1) as usize;
        for chunk in buffer.chunks_exact_mut(ch) {
            let sample = self.amplitude * self.next_f32();
            for out in chunk.iter_mut() {
                *out = sample;
            }
        }
    }

    fn generate_samples(&mut self, sample_count: usize) -> Vec<f32> {
        let mut buffer = vec![0.0f32; sample_count];
        self.fill_slice(&mut buffer);
        buffer
    }

    fn generate_duration(&mut self, duration_secs: f64) -> Vec<f32> {
        let total_frames = (duration_secs * (self.sample_rate as f64)).round() as usize;
        let total_samples = total_frames * (self.channels.max(1) as usize);
        self.generate_samples(total_samples)
    }
}

/// Signal analysis utility functions for calculating power, RMS, and peaks.
pub struct SignalMetrics;

impl SignalMetrics {
    /// Calculate Root-Mean-Square (RMS) power of a sample slice.
    pub fn rms(samples: &[f32]) -> f32 {
        if samples.is_empty() {
            return 0.0;
        }
        let sum_sq: f64 = samples.iter().map(|&s| (s as f64) * (s as f64)).sum();
        ((sum_sq / (samples.len() as f64)).sqrt()) as f32
    }

    /// Calculate absolute peak amplitude in a sample slice.
    pub fn peak_amplitude(samples: &[f32]) -> f32 {
        samples.iter().fold(0.0f32, |acc, &s| acc.max(s.abs()))
    }

    /// Compute maximum absolute second-difference across a signal:
    /// max |s[n] - 2*s[n-1] + s[n-2]|
    pub fn max_second_difference(samples: &[f32]) -> f32 {
        if samples.len() < 3 {
            return 0.0;
        }
        let mut max_diff = 0.0f32;
        for i in 2..samples.len() {
            let d2 = (samples[i] - 2.0 * samples[i - 1] + samples[i - 2]).abs();
            if d2 > max_diff {
                max_diff = d2;
            }
        }
        max_diff
    }
}
