//! Deterministic offline WAV sink rendering 32-bit float IEEE 754 LE audio files via hound.

use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::sink::OutputBackend;
use crate::types::{AudioSpec, BackendStats, SharedSinkStats, SinkError};

/// 64 KB buffer capacity for the underlying BufWriter.
const WAV_WRITE_BUFFER_CAPACITY: usize = 64 * 1024;

/// Offline sink writing audio directly to a 32-bit float WAV file at unthrottled CPU speed.
pub struct WavSink {
    path: PathBuf,
    writer: Option<hound::WavWriter<BufWriter<File>>>,
    spec: Option<AudioSpec>,
    stats: Arc<SharedSinkStats>,
    is_open: bool,
    is_running: bool,
}

impl WavSink {
    /// Create a new WavSink targeting the given destination path.
    pub fn new<P: AsRef<Path>>(path: P) -> Self {
        Self {
            path: path.as_ref().to_path_buf(),
            writer: None,
            spec: None,
            stats: Arc::new(SharedSinkStats::new()),
            is_open: false,
            is_running: false,
        }
    }

    /// Access the shared statistics container.
    pub fn shared_stats(&self) -> Arc<SharedSinkStats> {
        Arc::clone(&self.stats)
    }

    /// Write a contiguous slice of interleaved 32-bit float samples directly to the WAV file.
    pub fn write_samples(&mut self, samples: &[f32]) -> Result<usize, SinkError> {
        if !self.is_open || !self.is_running {
            return Err(SinkError::NotOpen);
        }
        let writer = self.writer.as_mut().ok_or(SinkError::NotOpen)?;

        for &sample in samples {
            writer
                .write_sample(sample)
                .map_err(|e| SinkError::WavError(e.to_string()))?;
        }

        let count = samples.len();
        let channels = self.spec.map_or(2, |s| s.channels);
        self.stats.record_consumption(count, channels);
        Ok(count)
    }

    /// Drain up to `max_samples` directly from an rtrb SPSC ring buffer into the WAV file.
    /// Utilizes rtrb's zero-copy read_chunk to access internal slices without heap allocations.
    pub fn drain_chunk(
        &mut self,
        consumer: &mut rtrb::Consumer<f32>,
        max_samples: usize,
    ) -> Result<usize, SinkError> {
        if !self.is_open || !self.is_running {
            return Err(SinkError::NotOpen);
        }
        let writer = self.writer.as_mut().ok_or(SinkError::NotOpen)?;

        let available = consumer.slots().min(max_samples);
        if available == 0 {
            return Ok(0);
        }

        let mut total_written = 0;
        if let Ok(chunk) = consumer.read_chunk(available) {
            let (first, second) = chunk.as_slices();
            for &sample in first {
                writer
                    .write_sample(sample)
                    .map_err(|e| SinkError::WavError(e.to_string()))?;
            }
            for &sample in second {
                writer
                    .write_sample(sample)
                    .map_err(|e| SinkError::WavError(e.to_string()))?;
            }
            total_written = first.len() + second.len();
            chunk.commit_all();
        }

        let channels = self.spec.map_or(2, |s| s.channels);
        self.stats.record_consumption(total_written, channels);
        self.stats.update_low_water_mark(consumer.slots());
        Ok(total_written)
    }

    /// Drain all remaining samples from the consumer until the producer signals EOF and the buffer is empty.
    pub fn drain_all(
        &mut self,
        consumer: &mut rtrb::Consumer<f32>,
        is_producer_finished: &AtomicBool,
    ) -> Result<u64, SinkError> {
        let mut total_drained = 0u64;
        let chunk_size = 8192;

        loop {
            let written = self.drain_chunk(consumer, chunk_size)?;
            total_drained += written as u64;

            if written == 0 {
                if is_producer_finished.load(Ordering::Acquire) && consumer.is_empty() {
                    break;
                }
                // Yield thread slice briefly to allow background decoder to stage more packets
                std::thread::yield_now();
            }
        }

        Ok(total_drained)
    }
}

impl OutputBackend for WavSink {
    fn open(&mut self, spec: AudioSpec) -> Result<(), SinkError> {
        spec.validate()
            .map_err(|e| SinkError::InvalidState(e.to_string()))?;

        let hound_spec = hound::WavSpec {
            channels: spec.channels,
            sample_rate: spec.sample_rate,
            bits_per_sample: 32,
            sample_format: hound::SampleFormat::Float,
        };

        let file = File::create(&self.path)?;
        let buf_writer = BufWriter::with_capacity(WAV_WRITE_BUFFER_CAPACITY, file);
        let writer = hound::WavWriter::new(buf_writer, hound_spec)
            .map_err(|e| SinkError::WavError(e.to_string()))?;

        self.writer = Some(writer);
        self.spec = Some(spec);
        self.is_open = true;
        self.is_running = false;
        self.stats.reset();

        Ok(())
    }

    fn start(&mut self) -> Result<(), SinkError> {
        if !self.is_open {
            return Err(SinkError::NotOpen);
        }
        self.is_running = true;
        self.stats.is_active.store(true, Ordering::Release);
        self.stats.is_paused.store(false, Ordering::Release);
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

        // Finalize WAV header (writing correct RIFF and data chunk byte sizes)
        if let Some(writer) = self.writer.take() {
            writer
                .finalize()
                .map_err(|e| SinkError::WavError(e.to_string()))?;
        }

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
        engine_protocol::SINK_TYPE_WAV
    }
}

impl Drop for WavSink {
    fn drop(&mut self) {
        if self.is_open {
            let _ = self.stop();
        }
    }
}
