//! Dual-slot stereo audio mixer with seamless track splicing and equal-power crossfading.
//!
//! Owns Slot A and Slot B, implementing the `AudioSource` trait to deliver interleaved
//! audio samples directly into `OutputBackend` streams with strict real-time safety.

pub mod crossfade;
pub mod slot;

pub use crossfade::CrossfadeState;
pub use slot::{SlotId, SlotState, VoiceSlot};

use crate::sink::AudioSource;

/// Dual-slot real-time stereo audio mixer.
pub struct DualSlotMixer {
    pub slot_a: VoiceSlot,
    pub slot_b: VoiceSlot,
    pub active_slot: SlotId,
    pub crossfade: Option<CrossfadeState>,
    pub master_volume: f32,
    pub is_paused: bool,
    pub auto_splice: bool,
}

impl Default for DualSlotMixer {
    fn default() -> Self {
        Self::new()
    }
}

impl DualSlotMixer {
    /// Create a new DualSlotMixer initialized with Slot A active and auto-splicing enabled.
    pub const fn new() -> Self {
        Self {
            slot_a: VoiceSlot::new(SlotId::A),
            slot_b: VoiceSlot::new(SlotId::B),
            active_slot: SlotId::A,
            crossfade: None,
            master_volume: 1.0,
            is_paused: false,
            auto_splice: true,
        }
    }

    /// Access a slot mutably by its identifier.
    #[inline]
    pub fn slot_mut(&mut self, id: SlotId) -> &mut VoiceSlot {
        match id {
            SlotId::A => &mut self.slot_a,
            SlotId::B => &mut self.slot_b,
        }
    }

    /// Access a slot immutably by its identifier.
    #[inline]
    pub fn slot(&self, id: SlotId) -> &VoiceSlot {
        match id {
            SlotId::A => &self.slot_a,
            SlotId::B => &self.slot_b,
        }
    }

    /// Start playback on the active slot.
    pub fn play(&mut self) {
        self.is_paused = false;
        self.slot_mut(self.active_slot).play();
    }

    /// Pause audio playback.
    pub fn pause(&mut self) {
        self.is_paused = true;
    }

    /// Set master linear volume [0.0, 1.0].
    pub fn set_volume(&mut self, volume: f32) {
        self.master_volume = volume.clamp(0.0, 1.0);
    }

    /// Initiate an equal-power crossfade transition to the standby slot.
    pub fn start_crossfade(&mut self, duration_frames: usize) -> Result<(), &'static str> {
        let standby = self.active_slot.opposite();
        if !self.slot(standby).has_audio() && self.slot(standby).state != SlotState::Primed {
            return Err("Standby slot has no primed audio to crossfade into");
        }

        self.slot_mut(standby).state = SlotState::Crossfading;
        self.slot_mut(self.active_slot).state = SlotState::Crossfading;
        self.crossfade = Some(CrossfadeState::new(self.active_slot, standby, duration_frames));
        Ok(())
    }

    /// Check if either slot has active audio playing or queued.
    pub fn is_active(&self) -> bool {
        self.slot_a.state == SlotState::Playing
            || self.slot_b.state == SlotState::Playing
            || self.slot_a.state == SlotState::Primed
            || self.slot_b.state == SlotState::Primed
            || self.crossfade.is_some()
    }
}

impl AudioSource for DualSlotMixer {
    /// Render interleaved stereo f32 samples into destination buffer.
    /// Real-time safe: Zero allocations, zero syscalls, zero mutexes, never panics.
    fn render(&mut self, output: &mut [f32]) -> usize {
        let len = output.len();
        if len == 0 {
            return 0;
        }

        if self.is_paused {
            output.fill(0.0);
            return len;
        }

        // Defensive clamp: fields are pub for the daemon's hot path, so an
        // out-of-range write elsewhere must never invert polarity or clip.
        let master = self.master_volume.clamp(0.0, 1.0);
        let mut written = 0;

        // -------------------------------------------------------------------
        // Case 1: Active Crossfade between Slot A and Slot B
        // -------------------------------------------------------------------
        if let Some(mut xfade) = self.crossfade.take() {
            let from_slot_id = xfade.from_slot;
            let to_slot_id = xfade.to_slot;

            let mut temp_from = [0.0f32; 2];
            let mut temp_to = [0.0f32; 2];

            while written + 2 <= len && !xfade.is_complete() {
                let (gain_from, gain_to) = xfade.step_frame();

                let read_from = self.slot_mut(from_slot_id).read_samples(&mut temp_from);
                let read_to = self.slot_mut(to_slot_id).read_samples(&mut temp_to);

                let s_from_l = if read_from >= 1 { temp_from[0] } else { 0.0 };
                let s_from_r = if read_from >= 2 { temp_from[1] } else { s_from_l };

                let s_to_l = if read_to >= 1 { temp_to[0] } else { 0.0 };
                let s_to_r = if read_to >= 2 { temp_to[1] } else { s_to_l };

                output[written] = (s_from_l * gain_from + s_to_l * gain_to) * master;
                output[written + 1] = (s_from_r * gain_from + s_to_r * gain_to) * master;
                written += 2;
            }

            if xfade.is_complete() {
                // Finalize crossfade transition. The retired slot is marked
                // Eos (NOT cleared): dropping its ring buffer here would free
                // ~1 MB on the real-time thread, and the Eos marker is what
                // the heartbeat uses to emit TrackEnd. The empty consumer is
                // released later on the command thread by the next prime().
                self.slot_mut(from_slot_id).state = SlotState::Eos;
                self.slot_mut(to_slot_id).state = SlotState::Playing;
                self.active_slot = to_slot_id;
                self.crossfade = None;
            } else {
                self.crossfade = Some(xfade);
                return written;
            }
        }

        // -------------------------------------------------------------------
        // Case 2: Standard Single-Slot Playback with Gapless Splice
        // -------------------------------------------------------------------
        while written < len {
            let active_id = self.active_slot;
            // Keep frame alignment: an odd tail sample can never form a stereo
            // frame, so terminate the frame loop and silence-fill it below.
            if len - written < 2 {
                break;
            }
            let chunk_read = self.slot_mut(active_id).read_samples(&mut output[written..]);

            if chunk_read > 0 {
                // Apply master volume
                if (master - 1.0).abs() > f32::EPSILON {
                    for s in &mut output[written..written + chunk_read] {
                        *s *= master;
                    }
                }
                written += chunk_read;
            } else {
                // Active slot produced 0 samples (EOS or empty)
                let standby_id = self.active_slot.opposite();

                if self.auto_splice && self.slot(standby_id).has_audio() {
                    // Seamless Gapless Splice: mark the exhausted slot Eos
                    // (NOT cleared — clearing would free the ring buffer on
                    // the real-time thread, and Eos is the TrackEnd signal;
                    // its empty consumer is released on the command thread by
                    // the next prime()), then continue filling from the newly
                    // active slot.
                    self.slot_mut(active_id).state = SlotState::Eos;
                    self.slot_mut(standby_id).state = SlotState::Playing;
                    self.active_slot = standby_id;
                    // Loop will continue and fill the remaining output slice from newly active slot!
                } else {
                    // Fill remaining output buffer with silence
                    output[written..].fill(0.0);
                    written = len;
                    break;
                }
            }
        }

        written
    }
}
