//! Bitstream inspection and profile validation for MPEG audio formats.
//! Gracefully identifies and rejects unsupported profiles such as HE-AAC (SBR/PS)
//! before decoding begins, preventing audio distortion and decoder crashes.

use crate::types::DecodeError;
use symphonia::core::codecs::{CodecParameters, CODEC_TYPE_AAC};

/// Bit-level reader operating on a contiguous byte slice without heap allocations.
pub struct BitReader<'a> {
    data: &'a [u8],
    bit_pos: usize,
}

impl<'a> BitReader<'a> {
    /// Create a new BitReader over the given byte slice.
    pub fn new(data: &'a [u8]) -> Self {
        Self { data, bit_pos: 0 }
    }

    /// Number of unread bits remaining in the slice.
    #[inline]
    pub fn remaining_bits(&self) -> usize {
        (self.data.len() * 8).saturating_sub(self.bit_pos)
    }

    /// Read up to 32 bits from the bitstream.
    pub fn read_bits(&mut self, n: usize) -> Option<u32> {
        if n == 0 || n > 32 || self.remaining_bits() < n {
            return None;
        }

        let mut val = 0u32;
        for _ in 0..n {
            let byte_idx = self.bit_pos / 8;
            let bit_idx = 7 - (self.bit_pos % 8);
            let bit = (self.data[byte_idx] >> bit_idx) & 1;
            val = (val << 1) | (bit as u32);
            self.bit_pos += 1;
        }
        Some(val)
    }
}

/// MPEG-4 Audio Object Types (AOT) defined in ISO/IEC 14496-3.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AudioObjectType {
    AacMain,
    AacLc,
    AacSsr,
    AacLtp,
    Sbr,        // HE-AAC v1
    AacScalable,
    TwinVq,
    Ps,         // HE-AAC v2
    Unknown(u32),
}

impl From<u32> for AudioObjectType {
    fn from(val: u32) -> Self {
        match val {
            1 => Self::AacMain,
            2 => Self::AacLc,
            3 => Self::AacSsr,
            4 => Self::AacLtp,
            5 => Self::Sbr,
            6 => Self::AacScalable,
            7 => Self::TwinVq,
            29 => Self::Ps,
            other => Self::Unknown(other),
        }
    }
}

/// Inspect codec parameters and reject unsupported profiles without panicking.
///
/// Specifically detects:
/// - Explicit HE-AAC (AudioObjectType 5 = SBR, 29 = PS) in AudioSpecificConfig.
/// - Hierarchical HE-AAC signaled via sync extension 0x2b7 in AudioSpecificConfig.
pub fn validate_codec_profile(params: &CodecParameters) -> Result<(), DecodeError> {
    if params.codec != CODEC_TYPE_AAC {
        return Ok(());
    }

    if let Some(extra_data) = &params.extra_data {
        inspect_aac_audio_specific_config(extra_data)?;
    }

    Ok(())
}

/// Parse ISO/IEC 14496-3 AudioSpecificConfig extra_data bytes to detect SBR/PS extensions.
pub fn inspect_aac_audio_specific_config(extra_data: &[u8]) -> Result<(), DecodeError> {
    if extra_data.is_empty() {
        return Ok(());
    }

    let mut reader = BitReader::new(extra_data);

    // 1. Read base Audio Object Type (5 bits)
    let raw_aot = match reader.read_bits(5) {
        Some(val) => val,
        None => return Ok(()),
    };

    let aot = if raw_aot == 31 {
        match reader.read_bits(6) {
            Some(ext) => 32 + ext,
            None => return Ok(()),
        }
    } else {
        raw_aot
    };

    let audio_object_type = AudioObjectType::from(aot);

    // Explicit AOT detection for SBR or PS
    if audio_object_type == AudioObjectType::Sbr {
        return Err(DecodeError::UnsupportedProfile(
            "Explicit HE-AAC v1 (SBR, AOT 5) is unsupported by Symphonia AAC-LC decoder".to_string(),
        ));
    }
    if audio_object_type == AudioObjectType::Ps {
        return Err(DecodeError::UnsupportedProfile(
            "Explicit HE-AAC v2 (Parametric Stereo, AOT 29) is unsupported by Symphonia AAC-LC decoder".to_string(),
        ));
    }

    // 2. Read sampling frequency index (4 bits)
    let sample_rate_idx = match reader.read_bits(4) {
        Some(idx) => idx,
        None => return Ok(()),
    };
    if sample_rate_idx == 0x0f {
        // Explicit 24-bit sample rate
        if reader.read_bits(24).is_none() {
            return Ok(());
        }
    }

    // 3. Read channel configuration (4 bits)
    if reader.read_bits(4).is_none() {
        return Ok(());
    }

    // 4. Parse GASpecificConfig for General Audio types (AOT 1, 2, 3, 4, 6, 7)
    match audio_object_type {
        AudioObjectType::AacMain
        | AudioObjectType::AacLc
        | AudioObjectType::AacSsr
        | AudioObjectType::AacLtp
        | AudioObjectType::AacScalable
        | AudioObjectType::TwinVq => {
            // frameLengthFlag (1 bit)
            if reader.read_bits(1).is_none() {
                return Ok(());
            }
            // dependsOnCoreCoder (1 bit)
            if let Some(depends) = reader.read_bits(1) {
                if depends != 0 {
                    // coreCoderDelay (14 bits)
                    if reader.read_bits(14).is_none() {
                        return Ok(());
                    }
                }
            } else {
                return Ok(());
            }
            // extensionFlag (1 bit)
            if reader.read_bits(1).is_none() {
                return Ok(());
            }
        }
        _ => return Ok(()),
    }

    // 5. Scan for hierarchical sync extension (0x2b7 = 11 bits: 0b01010110111)
    while reader.remaining_bits() >= 16 {
        // Peek or test next 11 bits
        let saved_pos = reader.bit_pos;
        if let Some(sync) = reader.read_bits(11) {
            if sync == 0x2b7 {
                if let Some(ext_aot) = reader.read_bits(5) {
                    if ext_aot == 5 {
                        return Err(DecodeError::UnsupportedProfile(
                            "Hierarchical HE-AAC v1 (SBR extension 0x2b7) detected; unsupported by AAC-LC decoder".to_string(),
                        ));
                    } else if ext_aot == 29 {
                        return Err(DecodeError::UnsupportedProfile(
                            "Hierarchical HE-AAC v2 (PS extension 0x2b7) detected; unsupported by AAC-LC decoder".to_string(),
                        ));
                    }
                }
            }
        }
        // Advance by 1 bit to search forward
        reader.bit_pos = saved_pos + 1;
    }

    Ok(())
}
