//! High-speed headless null sink for telemetry, continuous CI soak testing, and latency benchmarks.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

use crate::sink::OutputBackend;
use crate::types::{AudioSpec, BackendStats, SharedSinkStats, SinkError};

/// Headless sink tracking xruns, throughput, and buffer low-water marks without hardware audio devices.
pub struct NullSink {
    spec: Option<AudioSpec>,
    stats: Arc<SharedSinkStats>,
    is_open: bool,
    is_running: bool,
    pace_realtime: bool,
    last_pace_instant: Option<Instant>,
}

impl Default for NullSink {
    fn default() -> Self {
        Self::new()
    }
}

impl NullSink {
    /// Create a new high-speed NullSink running at unthrottled CPU speed.
    pub fn new() -> Self {
        Self {
            spec: None,
            stats: Arc::new(SharedSinkStats::new()),
            is_open: false,
            is_running: false,
            pace_realtime: false,
            last_pace_instant: None,
        }
    }

    /// Create a NullSink configured with optional real-time pacing simulation.
    pub fn with_pacing(pace_realtime: bool) -> Self {
        Self {
            pace_realtime,
            ..Self::new()
        }
    }

    /// Access the shared statistics container.
    pub fn shared_stats(&self) -> Arc<SharedSinkStats> {
        Arc::clone(&self.stats)
    }

    /// Ingest a contiguous slice of samples, updating sample and frame counters.
    pub fn consume_samples(&mut self, samples: &[f32]) {
        if !self.is_open || !self.is_running {
            return;
        }
        let channels = self.spec.map_or(2, |s| s.channels);
        self.stats.record_consumption(samples.len(), channels);
    }

    /// Drain a chunk of samples directly from an rtrb consumer.
    /// Updates low-water mark and detects buffer starvation (xruns) if available < requested.
    pub fn drain_chunk(&mut self, consumer: &mut rtrb::Consumer<f32>, chunk_size: usize) -> usize {
        if !self.is_open || !self.is_running {
            return 0;
        }

        let available = consumer.slots();
        self.stats.update_low_water_mark(available);

        let to_read = available.min(chunk_size);
        if to_read < chunk_size {
            // Under real-time paced simulation, starving the requested chunk counts as an xrun
            if self.pace_realtime {
                self.stats.record_xrun();
            }
        }

        let mut read_count = 0;
        if let Ok(chunk) = consumer.read_chunk(to_read) {
            read_count = chunk.len();
            chunk.commit_all();
        }

        let channels = self.spec.map_or(2, |s| s.channels);
        self.stats.record_consumption(read_count, channels);

        // Optional real-time sleep pacing
        if self.pace_realtime && read_count > 0 {
            if let Some(spec) = self.spec {
                let frames = read_count / spec.channels.max(1) as usize;
                let frame_duration = spec.frames_to_duration(frames as u64);
                std::thread::sleep(frame_duration);
            }
        }

        read_count
    }

    /// Drain all samples from consumer until producer finishes and buffer is empty.
    pub fn drain_all(
        &mut self,
        consumer: &mut rtrb::Consumer<f32>,
        is_producer_finished: &AtomicBool,
    ) -> u64 {
        let mut total = 0u64;
        let chunk_size = 4096;

        loop {
            let drained = self.drain_chunk(consumer, chunk_size);
            total += drained as u64;

            if drained == 0 {
                if is_producer_finished.load(Ordering::Acquire) && consumer.is_empty() {
                    break;
                }
                std::thread::yield_now();
            }
        }

        total
    }
}

impl OutputBackend for NullSink {
    fn open(&mut self, spec: AudioSpec) -> Result<(), SinkError> {
        spec.validate()
            .map_err(|e| SinkError::InvalidState(e.to_string()))?;
        self.spec = Some(spec);
        self.is_open = true;
        self.is_running = false;
        self.stats.reset();
        self.last_pace_instant = Some(Instant::now());
        Ok(())
    }

    fn start(&mut self) -> Result<(), SinkError> {
        if !self.is_open {
            return Err(SinkError::NotOpen);
        }
        self.is_running = true;
        self.stats.is_active.store(true, Ordering::Release);
        self.stats.is_paused.store(false, Ordering::Release);
        self.last_pace_instant = Some(Instant::now());
        Ok(())
    }

    fn pause(&mut self) -> Result<(), SinkError> {
        if !self.is_open {
            return Err(SinkError::NotOpen);
        }
        self.is_running = false;
        self.stats.is_paused.store(true, Ordering::Release);
        Ok(())
    }

    fn stop(&mut self) -> Result<(), SinkError> {
        self.is_running = false;
        self.stats.is_active.store(false, Ordering::Release);
        self.is_open = false;
        Ok(())
    }

    fn stats(&self) -> BackendStats {
        let sr = self.spec.map_or(44100, |s| s.sample_rate);
        self.stats.snapshot(sr)
    }

    fn is_open(&self) -> bool {
        self.is_open
    }

    fn is_running(&self) -> bool {
        self.is_running
    }

    fn sink_type(&self) -> &'static str {
        engine_protocol::SINK_TYPE_NULL
    }
}
