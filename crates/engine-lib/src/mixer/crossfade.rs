//! Sample-accurate equal-power crossfader for the Nora Native Audio Engine.
//!
//! Computes trigonometric quarter-sine crossfade curves ($g_A = \cos(\theta), g_B = \sin(\theta)$)
//! per-sample on the audio thread to guarantee constant acoustic power ($\cos^2 + \sin^2 = 1$).

use std::f32::consts::FRAC_PI_2;
use crate::mixer::slot::SlotId;

/// Active equal-power crossfade transition state.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CrossfadeState {
    pub from_slot: SlotId,
    pub to_slot: SlotId,
    pub total_frames: usize,
    pub current_frame: usize,
}

impl CrossfadeState {
    /// Initialize a new crossfade transition.
    pub fn new(from_slot: SlotId, to_slot: SlotId, total_frames: usize) -> Self {
        Self {
            from_slot,
            to_slot,
            total_frames: total_frames.max(1),
            current_frame: 0,
        }
    }

    /// Calculate the instantaneous equal-power gains `(gain_from, gain_to)` for the current frame
    /// and advance the transition by one frame.
    ///
    /// Real-time safe: Pure trigonometric evaluation with zero allocations.
    #[inline]
    pub fn step_frame(&mut self) -> (f32, f32) {
        if self.current_frame >= self.total_frames {
            return (0.0, 1.0);
        }

        let progress = (self.current_frame as f32) / (self.total_frames as f32);
        let theta = progress * FRAC_PI_2;

        let gain_from = theta.cos();
        let gain_to = theta.sin();

        self.current_frame += 1;
        (gain_from, gain_to)
    }

    /// Check if the crossfade transition has reached 100% completion.
    #[inline]
    pub fn is_complete(&self) -> bool {
        self.current_frame >= self.total_frames
    }

    /// Normalized progress in range [0.0, 1.0].
    #[inline]
    pub fn progress(&self) -> f32 {
        if self.total_frames == 0 {
            1.0
        } else {
            (self.current_frame as f32 / self.total_frames as f32).min(1.0)
        }
    }
}
