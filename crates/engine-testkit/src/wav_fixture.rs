//! Programmatic in-memory WAV file builder and fixture generator.
//!
//! Generates valid and intentionally malformed RIFF/WAVE files for testing decoders,
//! sinks, format converters, and metadata tag parsers.

use std::fs::File;
use std::io::{Cursor, Write};
use std::path::Path;

/// Builder for constructing standard RIFF/WAVE PCM or IEEE float audio fixtures.
#[derive(Debug, Clone)]
pub struct WavFixtureBuilder {
    pub sample_rate: u32,
    pub channels: u16,
    pub is_float: bool,
    pub bits_per_sample: u16,
    samples: Vec<f32>,
}

impl WavFixtureBuilder {
    /// Create a standard 32-bit float stereo fixture builder.
    pub fn new_f32_stereo(sample_rate: u32) -> Self {
        Self {
            sample_rate,
            channels: 2,
            is_float: true,
            bits_per_sample: 32,
            samples: Vec::new(),
        }
    }

    /// Create a standard 16-bit PCM stereo fixture builder.
    pub fn new_i16_stereo(sample_rate: u32) -> Self {
        Self {
            sample_rate,
            channels: 2,
            is_float: false,
            bits_per_sample: 16,
            samples: Vec::new(),
        }
    }

    /// Set channel count (1 for mono, 2 for stereo).
    pub fn with_channels(mut self, channels: u16) -> Self {
        self.channels = channels;
        self
    }

    /// Set sample rate in Hz.
    pub fn with_sample_rate(mut self, rate: u32) -> Self {
        self.sample_rate = rate;
        self
    }

    /// Append raw interleaved float samples.
    pub fn append_samples(mut self, samples: &[f32]) -> Self {
        self.samples.extend_from_slice(samples);
        self
    }

    /// Encode the WAV fixture directly into in-memory bytes without external dependencies.
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut buffer = Cursor::new(Vec::new());

        let bytes_per_sample = (self.bits_per_sample / 8) as u32;
        let block_align = self.channels * (self.bits_per_sample / 8);
        let byte_rate = self.sample_rate * (block_align as u32);
        let data_chunk_size = (self.samples.len() as u32) * bytes_per_sample;
        let riff_chunk_size = 36 + data_chunk_size;

        // RIFF Header
        buffer.write_all(b"RIFF").unwrap();
        buffer.write_all(&riff_chunk_size.to_le_bytes()).unwrap();
        buffer.write_all(b"WAVE").unwrap();

        // fmt Subchunk
        buffer.write_all(b"fmt ").unwrap();
        buffer.write_all(&16u32.to_le_bytes()).unwrap(); // Subchunk1Size (16 for PCM/Float)
        let audio_format: u16 = if self.is_float { 3 } else { 1 }; // 3 = IEEE Float, 1 = PCM
        buffer.write_all(&audio_format.to_le_bytes()).unwrap();
        buffer.write_all(&self.channels.to_le_bytes()).unwrap();
        buffer.write_all(&self.sample_rate.to_le_bytes()).unwrap();
        buffer.write_all(&byte_rate.to_le_bytes()).unwrap();
        buffer.write_all(&block_align.to_le_bytes()).unwrap();
        buffer.write_all(&self.bits_per_sample.to_le_bytes()).unwrap();

        // data Subchunk
        buffer.write_all(b"data").unwrap();
        buffer.write_all(&data_chunk_size.to_le_bytes()).unwrap();

        if self.is_float {
            for &s in &self.samples {
                buffer.write_all(&s.to_le_bytes()).unwrap();
            }
        } else {
            for &s in &self.samples {
                let clamped = s.clamp(-1.0, 1.0);
                let int_val = (clamped * 32767.0).round() as i16;
                buffer.write_all(&int_val.to_le_bytes()).unwrap();
            }
        }

        buffer.into_inner()
    }

    /// Write the generated WAV fixture to a file on disk.
    pub fn write_to_file<P: AsRef<Path>>(&self, path: P) -> std::io::Result<()> {
        let bytes = self.to_bytes();
        let mut file = File::create(path)?;
        file.write_all(&bytes)?;
        file.flush()?;
        Ok(())
    }

    /// Generate an intentionally malformed WAV fixture with truncated header.
    pub fn build_truncated_header() -> Vec<u8> {
        b"RIFF\x14\x00\x00\x00WAVEfmt ".to_vec()
    }

    /// Generate an intentionally corrupt WAV with invalid RIFF magic.
    pub fn build_invalid_magic() -> Vec<u8> {
        b"NOPE\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x02\x00\x44\xac\x00\x00".to_vec()
    }

    /// Generate an empty 0-length WAV file with valid headers but 0 data bytes.
    pub fn build_empty_audio(sample_rate: u32, channels: u16) -> Vec<u8> {
        Self::new_f32_stereo(sample_rate)
            .with_channels(channels)
            .to_bytes()
    }
}
