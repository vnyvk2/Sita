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
    pub pending_transition_complete: Option<SlotId>,
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
            pending_transition_complete: None,
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

    /// Cancel an in-flight crossfade, establishing `authoritative_slot` as the sole active slot.
    ///
    /// The authoritative slot's gain is restored to 1.0 and its state set to Playing.
    /// The abandoned slot is fully cleared (gain 1.0, state Empty, decoder signaled to stop).
    /// Suppresses any pending transition completion.
    pub fn cancel_crossfade(&mut self, authoritative_slot: SlotId) {
        if self.crossfade.take().is_some() {
            let other_slot = authoritative_slot.opposite();
            self.active_slot = authoritative_slot;
            let auth = self.slot_mut(authoritative_slot);
            auth.gain = 1.0;
            if auth.state == SlotState::Crossfading {
                auth.state = SlotState::Playing;
            }
            let abandoned = self.slot_mut(other_slot);
            abandoned.clear();
            self.pending_transition_complete = None;
        }
    }

    /// Explicitly set the active slot, cancelling any in-flight crossfade and resetting gain.
    pub fn set_active_slot(&mut self, slot: SlotId) {
        if self.crossfade.take().is_some() {
            let other_slot = slot.opposite();
            let abandoned = self.slot_mut(other_slot);
            abandoned.clear();
            self.pending_transition_complete = None;
        } else if self.active_slot != slot {
            let other_slot = slot.opposite();
            if self.slot(other_slot).state == SlotState::Playing {
                self.slot_mut(other_slot).state = SlotState::Paused;
            }
        }
        self.active_slot = slot;
        self.slot_mut(slot).gain = 1.0;
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
                self.pending_transition_complete = Some(to_slot_id);
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
                // Active slot produced 0 samples. Auto-splice only if active slot is genuinely at Eos.
                let standby_id = self.active_slot.opposite();

                if self.auto_splice && self.slot(active_id).state == SlotState::Eos && self.slot(standby_id).has_audio() {
                    // Seamless Gapless Splice: mark the exhausted slot Eos
                    // (NOT cleared — clearing would free the ring buffer on
                    // the real-time thread, and Eos is the TrackEnd signal;
                    // its empty consumer is released on the command thread by
                    // the next prime()), then continue filling from the newly
                    // active slot.
                    self.slot_mut(active_id).state = SlotState::Eos;
                    self.slot_mut(standby_id).state = SlotState::Playing;
                    self.active_slot = standby_id;
                    self.pending_transition_complete = Some(standby_id);
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::buffer::transport::BoundedAudioTransport;
    use crate::AudioSpec;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    #[test]
    fn test_auto_splice_does_not_hijack_buffering_active_slot() {
        let spec = AudioSpec::new_f32_stereo(44100);
        let mut mixer = DualSlotMixer::new();

        // 1. Prime Slot A (active) with empty transport and decoder NOT at EOF (stop_signal = false).
        // This simulates a track that has just been loaded/primed while its decoder thread is spinning up.
        let (mut prod_a, cons_a) = BoundedAudioTransport::create(&spec, 1.0);
        let stop_a = Arc::new(AtomicBool::new(false));
        mixer.slot_mut(SlotId::A).prime(cons_a, spec, Arc::clone(&stop_a));
        mixer.play();

        // 2. Prime Slot B (standby) with preloaded audio ready to go.
        let (mut prod_b, cons_b) = BoundedAudioTransport::create(&spec, 1.0);
        let stop_b = Arc::new(AtomicBool::new(false));
        prod_b.try_push(&[0.5, 0.5, 0.5, 0.5]);
        mixer.slot_mut(SlotId::B).prime(cons_b, spec, stop_b);

        // 3. Render audio while Slot A is still buffering (available samples == 0).
        let mut out = [999.0f32; 4];
        let written = mixer.render(&mut out);

        // Assert: Slot A must NOT have been abandoned or marked Eos!
        assert_eq!(mixer.active_slot, SlotId::A, "Active slot must stay Slot A while buffering");
        assert_eq!(mixer.slot(SlotId::A).state, SlotState::Playing, "Slot A must remain Playing");
        assert_eq!(out, [0.0, 0.0, 0.0, 0.0], "Output must be silence while buffering");
        assert_eq!(written, 4);

        // 4. Now Slot A decoder delivers audio frames
        prod_a.try_push(&[0.25, 0.25, 0.25, 0.25]);
        let mut out2 = [0.0f32; 4];
        mixer.render(&mut out2);
        assert_eq!(out2, [0.25, 0.25, 0.25, 0.25], "Slot A audio must play");
        assert_eq!(mixer.active_slot, SlotId::A);

        // 5. Now Slot A reaches natural EOF
        stop_a.store(true, Ordering::Release);
        // Next render drains Slot A to EOS and auto-splices seamlessly into Slot B
        let mut out3 = [0.0f32; 4];
        mixer.render(&mut out3);
        assert_eq!(mixer.active_slot, SlotId::B, "Auto-splice must trigger when Slot A reaches genuine EOS");
        assert_eq!(out3, [0.5, 0.5, 0.5, 0.5], "Slot B audio must play seamlessly upon EOS");
        assert_eq!(mixer.pending_transition_complete, Some(SlotId::B));
    }
}
