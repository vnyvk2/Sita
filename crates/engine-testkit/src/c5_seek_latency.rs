//! C5 Acceptance Criteria: Seek Turnaround Latency Benchmark.
//!
//! Measures elapsed turnaround latency from seek command dispatch/receipt
//! to the first audio frame emission at the new position (target <= 30 ms).

use std::time::{Duration, Instant};

/// Benchmark results for a series of seek turnaround measurements.
#[derive(Debug, Clone)]
pub struct SeekLatencyReport {
    /// Number of seek operations executed.
    pub iterations: usize,
    /// Minimum observed turnaround latency.
    pub min_latency: Duration,
    /// Maximum observed turnaround latency.
    pub max_latency: Duration,
    /// Mean turnaround latency across all iterations.
    pub mean_latency: Duration,
    /// 95th percentile latency.
    pub p95_latency: Duration,
    /// Target threshold (30ms).
    pub threshold: Duration,
    /// Whether all iterations satisfied the <= 30ms requirement.
    pub passed_requirement: bool,
}

impl SeekLatencyReport {
    pub fn summary(&self) -> String {
        format!(
            "SeekLatencyReport: n={}, min={:.2}ms, max={:.2}ms, mean={:.2}ms, p95={:.2}ms (threshold={:.1}ms, passed={})",
            self.iterations,
            self.min_latency.as_secs_f64() * 1000.0,
            self.max_latency.as_secs_f64() * 1000.0,
            self.mean_latency.as_secs_f64() * 1000.0,
            self.p95_latency.as_secs_f64() * 1000.0,
            self.threshold.as_secs_f64() * 1000.0,
            self.passed_requirement
        )
    }
}

pub struct SeekLatencyTimer {
    threshold: Duration,
    measurements: Vec<Duration>,
    current_start: Option<Instant>,
}

impl SeekLatencyTimer {
    pub fn new(threshold: Duration) -> Self {
        Self {
            threshold,
            measurements: Vec::new(),
            current_start: None,
        }
    }

    /// Mark dispatch of a seek command.
    pub fn start_seek(&mut self) {
        self.current_start = Some(Instant::now());
    }

    /// Mark arrival of the first post-seek decoded/rendered audio frame.
    pub fn record_first_frame(&mut self) -> Option<Duration> {
        if let Some(start) = self.current_start.take() {
            let elapsed = start.elapsed();
            self.measurements.push(elapsed);
            Some(elapsed)
        } else {
            None
        }
    }

    /// Record a direct duration measurement.
    pub fn record_duration(&mut self, latency: Duration) {
        self.measurements.push(latency);
    }

    /// Compile benchmark report.
    pub fn finalize(&self) -> SeekLatencyReport {
        assert!(!self.measurements.is_empty(), "No seek measurements recorded");

        let mut sorted = self.measurements.clone();
        sorted.sort();

        let n = sorted.len();
        let min_latency = sorted[0];
        let max_latency = sorted[n - 1];

        let sum: Duration = sorted.iter().sum();
        let mean_latency = sum / (n as u32);

        let p95_idx = ((n as f64 * 0.95).ceil() as usize).saturating_sub(1).min(n - 1);
        let p95_latency = sorted[p95_idx];

        let passed_requirement = max_latency <= self.threshold;

        SeekLatencyReport {
            iterations: n,
            min_latency,
            max_latency,
            mean_latency,
            p95_latency,
            threshold: self.threshold,
            passed_requirement,
        }
    }
}
