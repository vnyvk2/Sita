//! C4 Acceptance Criteria: Bounded Memory & Soak Stability Monitor.
//!
//! Tracks process memory usage (RSS <= 40MB), zero underrun assertions (xrun == 0),
//! and ring buffer low-water mark health during extended streaming soak runs.

use std::time::Duration;

/// Configuration for an automated soak run.
#[derive(Debug, Clone)]
pub struct SoakConfig {
    /// Target duration of the soak run.
    pub target_duration: Duration,
    /// Maximum allowed resident set size (RSS) in megabytes (default: 40 MB).
    pub max_rss_mb: f64,
    /// Interval at which telemetry samples are recorded.
    pub sample_interval: Duration,
    /// Minimum allowed ring buffer low-water mark ratio (e.g. 0.05 = 5% capacity).
    pub min_watermark_ratio: f64,
}

impl Default for SoakConfig {
    fn default() -> Self {
        Self {
            target_duration: Duration::from_secs(600), // 10 minutes
            max_rss_mb: 40.0,
            sample_interval: Duration::from_millis(250),
            min_watermark_ratio: 0.05,
        }
    }
}

/// Point-in-time sample collected during soak run.
#[derive(Debug, Clone)]
pub struct SoakSnapshot {
    pub elapsed: Duration,
    pub rss_bytes: usize,
    pub total_samples_consumed: u64,
    pub xrun_count: u64,
    pub low_water_mark: usize,
}

/// Comprehensive report from a soak test.
#[derive(Debug, Clone)]
pub struct SoakReport {
    pub total_elapsed: Duration,
    pub peak_rss_bytes: usize,
    pub final_rss_bytes: usize,
    pub total_xruns: u64,
    pub minimum_observed_watermark: usize,
    pub total_samples_streamed: u64,
    pub passed_rss_constraint: bool,
    pub passed_xrun_constraint: bool,
    pub passed_watermark_constraint: bool,
    pub is_stable: bool,
}

impl SoakReport {
    pub fn peak_rss_mb(&self) -> f64 {
        (self.peak_rss_bytes as f64) / (1024.0 * 1024.0)
    }

    pub fn summary(&self) -> String {
        format!(
            "SoakReport: elapsed={:.1}s, peak_rss={:.2}MB, xruns={}, min_watermark={}, is_stable={}",
            self.total_elapsed.as_secs_f64(),
            self.peak_rss_mb(),
            self.total_xruns,
            self.minimum_observed_watermark,
            self.is_stable
        )
    }
}

pub struct SoakMonitor {
    config: SoakConfig,
    snapshots: Vec<SoakSnapshot>,
    peak_rss: usize,
    min_watermark: usize,
}

impl SoakMonitor {
    pub fn new(config: SoakConfig) -> Self {
        Self {
            config,
            snapshots: Vec::new(),
            peak_rss: 0,
            min_watermark: usize::MAX,
        }
    }

    /// Record a telemetry snapshot from the running audio engine.
    pub fn record_snapshot(
        &mut self,
        elapsed: Duration,
        rss_bytes: usize,
        total_samples: u64,
        xruns: u64,
        low_water_mark: usize,
    ) {
        if rss_bytes > self.peak_rss {
            self.peak_rss = rss_bytes;
        }
        if low_water_mark < self.min_watermark {
            self.min_watermark = low_water_mark;
        }

        self.snapshots.push(SoakSnapshot {
            elapsed,
            rss_bytes,
            total_samples_consumed: total_samples,
            xrun_count: xruns,
            low_water_mark,
        });
    }

    /// Compile final audit report.
    pub fn finalize(
        &self,
        total_elapsed: Duration,
        total_samples: u64,
        total_xruns: u64,
        buffer_capacity: usize,
    ) -> SoakReport {
        let max_bytes = (self.config.max_rss_mb * 1024.0 * 1024.0) as usize;
        let passed_rss_constraint = self.peak_rss <= max_bytes;
        let passed_xrun_constraint = total_xruns == 0;

        let min_required_watermark = (buffer_capacity as f64 * self.config.min_watermark_ratio) as usize;
        let passed_watermark_constraint = self.min_watermark >= min_required_watermark || buffer_capacity == 0;

        let final_rss = self.snapshots.last().map(|s| s.rss_bytes).unwrap_or(self.peak_rss);
        let is_stable = passed_rss_constraint && passed_xrun_constraint && passed_watermark_constraint;

        SoakReport {
            total_elapsed,
            peak_rss_bytes: self.peak_rss,
            final_rss_bytes: final_rss,
            total_xruns,
            minimum_observed_watermark: self.min_watermark,
            total_samples_streamed: total_samples,
            passed_rss_constraint,
            passed_xrun_constraint,
            passed_watermark_constraint,
            is_stable,
        }
    }
}
