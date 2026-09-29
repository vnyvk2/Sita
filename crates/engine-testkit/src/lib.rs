//! `engine-testkit`: Testing harness, synthetic audio generators, and audit tooling
//! for the Nora Native Rust Audio Engine.

pub mod generator;
pub mod wav_fixture;
pub mod c1_null_test;
pub mod c2_splice_audit;
pub mod c3_crossfade_audit;
pub mod c4_soak_test;
pub mod c5_seek_latency;
pub mod protocol_mock;
pub mod mock_backend;

pub use generator::*;
pub use wav_fixture::*;
pub use c1_null_test::*;
pub use c2_splice_audit::*;
pub use c3_crossfade_audit::*;
pub use c4_soak_test::*;
pub use c5_seek_latency::*;
pub use protocol_mock::*;
pub use mock_backend::*;
