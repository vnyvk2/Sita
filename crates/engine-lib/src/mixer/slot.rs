//! Individual voice slot for the dual-slot audio mixer.
//!
//! Manages slot lifecycle states, ring buffer consumption, gain application,
//! and EOS tracking for Slot A and Slot B.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use serde::{Deserialize, Serialize};

use crate::buffer::AudioConsumer;
use crate::types::AudioSpec;

/// Identifier for mixer voice slots.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SlotId {
    A,
    B,
}

impl SlotId {
    /// Return the opposite slot.
    #[inline]
    pub const fn opposite(self) -> Self {
        match self {
            SlotId::A => SlotId::B,
            SlotId::B => SlotId::A,
        }
    }
}

/// Lifecycle state of a voice slot.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SlotState {
    /// Slot is empty; no track is loaded or queued.
    #[default]
    Empty,
    /// Track is loaded, decoded, and buffered into the ring buffer, ready for instant playback.
    Primed,
    /// Track is actively playing audio.
    Playing,
    /// Track is paused.
    Paused,
    /// Track is participating in an active crossfade transition.
    Crossfading,
    /// Track has exhausted all audio frames (End of Stream).
    Eos,
}

/// Voice slot holding an audio consumer, current gain, and playback position.
pub struct VoiceSlot {
    pub id: SlotId,
    pub state: SlotState,
    pub consumer: Option<AudioConsumer>,
    pub spec: Option<AudioSpec>,
    pub gain: f32,
    pub frames_consumed: u64,
    pub stop_signal: Option<Arc<AtomicBool>>,
}

impl VoiceSlot {
    /// Create a new empty voice slot with unity gain.
    pub const fn new(id: SlotId) -> Self {
        Self {
            id,
            state: SlotState::Empty,
            consumer: None,
            spec: None,
            gain: 1.0,
            frames_consumed: 0,
            stop_signal: None,
        }
    }

    /// Attach a primed audio consumer and spec to this slot.
    pub fn prime(
        &mut self,
        consumer: AudioConsumer,
        spec: AudioSpec,
        stop_signal: Arc<AtomicBool>,
    ) {
        // Signal any previous decoder thread to exit BEFORE dropping its
        // consumer: otherwise the orphaned thread spins forever on a full
        // abandoned ring (push_with_backpressure never sees stop).
        if let Some(old) = self.stop_signal.take() {
            old.store(true, Ordering::Relaxed);
        }
        // Drop the previous consumer endpoint explicitly.
        self.consumer = None;
        self.consumer = Some(consumer);
        self.spec = Some(spec);
        self.stop_signal = Some(stop_signal);
        self.frames_consumed = 0;
        self.gain = 1.0;
        self.state = SlotState::Primed;
    }

    /// Read up to `buf.len()` samples from the attached ring buffer.
    /// Real-time safe: Zero allocations, zero syscalls, zero mutexes.
    #[inline]
    pub fn read_samples(&mut self, buf: &mut [f32]) -> usize {
        let consumer = match self.consumer.as_mut() {
            Some(c) => c,
            None => return 0,
        };

        let read = consumer.pop_slice(buf);
        let channels = self.spec.map_or(2, |s| s.channels as usize);
        self.frames_consumed += (read / channels.max(1)) as u64;

        if consumer.available_samples() == 0 {
            // Check if producer signaled EOF
            if let Some(stop) = &self.stop_signal {
                if stop.load(Ordering::Relaxed) {
                    self.state = SlotState::Eos;
                }
            }
        }

        read
    }

    /// Mark the slot as playing.
    pub fn play(&mut self) {
        if self.state == SlotState::Primed || self.state == SlotState::Paused {
            self.state = SlotState::Playing;
        }
    }

    /// Pause the slot.
    pub fn pause(&mut self) {
        if self.state == SlotState::Playing {
            self.state = SlotState::Paused;
        }
    }

    /// Reset and release the slot resources.
    ///
    /// WARNING: never call from the real-time audio thread — dropping the
    /// ring buffer frees heap memory. Render-path retirement uses Eos
    /// marking instead; the empty consumer is released here (or by prime())
    /// on command threads only.
    pub fn clear(&mut self) {
        if let Some(stop) = &self.stop_signal {
            stop.store(true, Ordering::Relaxed);
        }
        self.consumer = None;
        self.spec = None;
        self.stop_signal = None;
        self.frames_consumed = 0;
        self.gain = 1.0;
        self.state = SlotState::Empty;
    }

    /// Check if slot has audio ready to be consumed.
    #[inline]
    pub fn has_audio(&self) -> bool {
        self.consumer.as_ref().is_some_and(|c| c.available_samples() > 0)
    }

    /// Available samples currently in this slot's ring buffer.
    #[inline]
    pub fn available_samples(&self) -> usize {
        self.consumer.as_ref().map_or(0, |c| c.available_samples())
    }
}
