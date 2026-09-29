//! Thread-safe bounded ring buffering and sample-accurate playhead tracking.

pub mod playhead;
pub mod transport;

pub use playhead::PlayheadTracker;
pub use transport::{
    AudioConsumer, AudioProducer, BoundedAudioTransport, DEFAULT_BUFFER_DURATION_SECS,
    MAX_BUFFER_DURATION_SECS, MIN_BUFFER_DURATION_SECS,
};
