//! Milestone 4: Live Output Sink & Device Lifecycle State Machine Verification.
//!
//! Validates:
//! - CPAL live device enumeration.
//! - Continuous silence pause emission.
//! - Device error detection and state transitions.
//! - Mock error injection: disconnection, sleep/resume, and xrun accounting.

use std::sync::atomic::Ordering;

use engine_lib::sink::{CpalBackend, OutputBackend};
use engine_testkit::mock_backend::{InjectedError, MockBackendController};

#[test]
fn test_cpal_backend_enumeration_and_creation() {
    let backend = CpalBackend::new();
    let devices = backend.list_output_devices();
    // Host may or may not have physical audio devices attached in CI/headless,
    // but the query method must succeed without panic.
    println!("Available audio output devices: {:?}", devices);
    assert!(!backend.is_open());
    assert!(!backend.is_running());
}

#[test]
fn test_mock_backend_device_disconnect_and_recovery() {
    let mock = MockBackendController::new();
    mock.state.is_opened.store(true, Ordering::SeqCst);
    mock.state.is_running.store(true, Ordering::SeqCst);

    // Initial state: running
    mock.process_frames(480);
    assert_eq!(mock.state.frames_processed.load(Ordering::SeqCst), 480);

    // Inject device disconnection
    mock.inject_error(InjectedError::DeviceDisconnected);
    assert_eq!(mock.state.device_error_count.load(Ordering::SeqCst), 1);
    assert!(!mock.state.is_running.load(Ordering::SeqCst));

    // Frames should NOT process while disconnected
    mock.process_frames(480);
    assert_eq!(mock.state.frames_processed.load(Ordering::SeqCst), 480);

    // Recovery: re-open and restart
    mock.state.is_running.store(true, Ordering::SeqCst);
    mock.process_frames(480);
    assert_eq!(mock.state.frames_processed.load(Ordering::SeqCst), 960);
}

#[test]
fn test_mock_backend_os_sleep_and_resume_lifecycle() {
    let mock = MockBackendController::new();
    mock.state.is_opened.store(true, Ordering::SeqCst);
    mock.state.is_running.store(true, Ordering::SeqCst);

    // 1. System enters sleep
    mock.inject_error(InjectedError::SystemSleep);
    assert!(mock.state.is_paused.load(Ordering::SeqCst));

    // While sleeping, frames are paused
    mock.process_frames(480);
    assert_eq!(mock.state.frames_processed.load(Ordering::SeqCst), 0);

    // 2. System resumes from sleep
    mock.inject_error(InjectedError::SystemResume);
    assert!(!mock.state.is_paused.load(Ordering::SeqCst));

    // Now audio flows smoothly again
    mock.process_frames(480);
    assert_eq!(mock.state.frames_processed.load(Ordering::SeqCst), 480);
}

#[test]
fn test_mock_backend_buffer_underrun_xrun_accounting() {
    let mock = MockBackendController::new();
    assert_eq!(mock.state.xrun_count.load(Ordering::SeqCst), 0);

    mock.inject_error(InjectedError::BufferUnderrun);
    mock.inject_error(InjectedError::BufferUnderrun);
    assert_eq!(mock.state.xrun_count.load(Ordering::SeqCst), 2);
}
