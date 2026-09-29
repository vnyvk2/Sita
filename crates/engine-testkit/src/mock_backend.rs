//! Mock Audio Backend & Error Injection Framework.
//!
//! Simulates audio device callbacks, OS sleep/resume transitions, hardware
//! disconnections, and underruns to test device lifecycle management and recovery.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

/// Injected error conditions for testing device recovery state machines.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InjectedError {
    /// Audio endpoint unplugged or Bluetooth connection severed.
    DeviceDisconnected,
    /// OS power event: system entering sleep mode.
    SystemSleep,
    /// OS power event: system resuming from sleep mode.
    SystemResume,
    /// Device default format or sample rate changed by external application.
    FormatChanged,
    /// Driver buffer underrun/xrun reported.
    BufferUnderrun,
}

/// Simulated mock backend state.
#[derive(Debug)]
pub struct MockBackendState {
    pub is_opened: AtomicBool,
    pub is_running: AtomicBool,
    pub is_paused: AtomicBool,
    pub frames_processed: AtomicU64,
    pub xrun_count: AtomicU64,
    pub device_error_count: AtomicU64,
    pub should_fail_next_callback: AtomicBool,
}

impl Default for MockBackendState {
    fn default() -> Self {
        Self {
            is_opened: AtomicBool::new(false),
            is_running: AtomicBool::new(false),
            is_paused: AtomicBool::new(false),
            frames_processed: AtomicU64::new(0),
            xrun_count: AtomicU64::new(0),
            device_error_count: AtomicU64::new(0),
            should_fail_next_callback: AtomicBool::new(false),
        }
    }
}

/// Mock backend controller for error injection.
#[derive(Debug, Clone)]
pub struct MockBackendController {
    pub state: Arc<MockBackendState>,
}

impl MockBackendController {
    pub fn new() -> Self {
        Self {
            state: Arc::new(MockBackendState::default()),
        }
    }

    pub fn inject_error(&self, error: InjectedError) {
        match error {
            InjectedError::DeviceDisconnected | InjectedError::FormatChanged => {
                self.state.device_error_count.fetch_add(1, Ordering::SeqCst);
                self.state.is_running.store(false, Ordering::SeqCst);
            }
            InjectedError::SystemSleep => {
                self.state.is_paused.store(true, Ordering::SeqCst);
            }
            InjectedError::SystemResume => {
                self.state.is_paused.store(false, Ordering::SeqCst);
            }
            InjectedError::BufferUnderrun => {
                self.state.xrun_count.fetch_add(1, Ordering::SeqCst);
            }
        }
    }

    /// Simulate audio callback pulling frames.
    pub fn process_frames(&self, frame_count: u64) {
        if self.state.is_running.load(Ordering::Relaxed) && !self.state.is_paused.load(Ordering::Relaxed) {
            self.state.frames_processed.fetch_add(frame_count, Ordering::Relaxed);
        }
    }
}
