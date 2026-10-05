//! Nora Audio Engine Daemon (`engine-cli`) entrypoint.

pub mod daemon;

use daemon::EngineDaemon;

fn main() {
    // Initialize env_logger writing strictly to stderr so stdout is reserved for JSON-lines protocol
    env_logger::Builder::from_default_env()
        .target(env_logger::Target::Stderr)
        .init();

    let mut daemon = EngineDaemon::new();
    daemon.run_stdio_loop();
}
