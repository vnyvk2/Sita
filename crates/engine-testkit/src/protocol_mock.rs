//! Protocol test harness for the canonical `engine-protocol` schema.
//!
//! Re-exports the single source of truth and provides line-framing helpers
//! for encoding correlated requests and decoding daemon stdout. There is
//! intentionally NO legacy id-less serializer: every command on the wire
//! carries a correlation id, and tests must exercise that contract.

pub use engine_protocol::{
    DaemonCommand, DaemonEvent, DaemonRequest, DaemonResponse, DaemonResult, PlaybackState, SlotId,
};

/// Protocol testing harness for encoding commands and decoding responses/events.
pub struct ProtocolHarness;

impl ProtocolHarness {
    /// Serialize a correlated daemon request into a newline-terminated JSON string.
    pub fn serialize_request(req: &DaemonRequest) -> Result<String, serde_json::Error> {
        let mut json = serde_json::to_string(req)?;
        json.push('\n');
        Ok(json)
    }

    /// Parse a single line received from daemon stdout into an event.
    pub fn parse_event(line: &str) -> Result<DaemonEvent, serde_json::Error> {
        serde_json::from_str(line.trim())
    }

    /// Parse a command response.
    pub fn parse_response(line: &str) -> Result<DaemonResponse, serde_json::Error> {
        serde_json::from_str(line.trim())
    }

    /// Validate that a raw JSON string adheres strictly to the event schema.
    pub fn validate_raw_event(json_str: &str) -> Result<DaemonEvent, String> {
        serde_json::from_str::<DaemonEvent>(json_str.trim())
            .map_err(|e| format!("Schema validation error: {e} for json: {json_str}"))
    }
}
