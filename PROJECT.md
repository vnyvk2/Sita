# Project: Nora Native Rust Audio Engine

## Architecture

The Nora Native Rust Audio Engine is an isolated, high-performance audio subsystem organized as a modular Cargo workspace within `crates/`:

```
crates/
├── engine-lib/       # Core audio engine, decoding, DSP chain, sink abstraction, real-time safety
├── engine-cli/       # Standalone headless daemon exposing asynchronous JSON-lines stdio protocol
└── engine-testkit/   # Test fixtures, synthetic generators, splice auditors, and verification suites
```

### High-Level Data Flow
```
[Storage: Audio Files]
       │
       ▼ (Background Decoder Threads - Slot A / Slot B)
[Symphonia Probe & Decoder]
       │
       ▼ (Trimming: LAME Xing / iTunSMPB delay & padding dropped BEFORE resampler)
[Gapless Trimming Stage]
       │
       ▼ (Optional Rubato Sinc Resampler if native rate != engine rate)
[Resampling Stage]
       │
       ▼ (Push to lock-free SPSC Ring Buffer: rtrb::Producer)
[Bounded SPSC Ring Buffers (Slot A & Slot B)] ~ 2-4 seconds bounded memory (RSS <= 40MB)
       │
       ▼ (Pop from rtrb::Consumer on real-time audio / sink thread)
[Dual-Slot Mixer & Equal-Power Crossfade Stage]
       │
       ▼ (In Processed Mode; bypassed in Bypass Mode with unity gain & native rate)
[DSP Chain: ReplayGain -> 10-Band EQ -> Mid-Side Karaoke -> 5ms Lookahead Limiter]
       │
       ▼ (F32 normalization / I16 TPDF dither)
[Format Conversion]
       │
       ├─────────────────────────┬─────────────────────────┐
       ▼                         ▼                         ▼
[CpalBackend: Live Audio]   [WavSink: Offline Render]   [NullSink: Telemetry Soak]
(WASAPI/ASIO live stream)   (Bit-accurate 32-bit WAV)   (Zero-overhead soak/xrun track)
```

### Core Invariants
1. **Strict Real-Time Callback Discipline**: The audio callback must execute zero system calls, zero mutex locks, zero dynamic memory allocations, and must never panic.
2. **Bounded Memory Footprint**: Background decoders stream into `rtrb` ring buffers sized for 2–4 seconds of audio. Total process RSS remains $\le 40\text{ MB}$ even during continuous high-resolution 192kHz/24-bit FLAC playback.
3. **Accurate Playhead Source**: Derived strictly from monotonic atomic counter of frames consumed by the output callback, never wall-clock estimates.
4. **Continuous Silence Pause**: Pausing emits continuous silence ($0.0\text{f32}$) to retain hardware audio endpoint locks and avoid unpause clicks/latency.
5. **Strict Bypass Definition**: Bit-transparent passthrough is guaranteed when stream sample rate equals native track rate and volume is unity ($1.0$).

---

## Toolchain & Environment Conventions
- Host OS: Windows
- Available Package Managers: Scoop (`C:\Users\VINAY\scoop\shims\scoop.ps1`), Winget
- Provisioning command for workers: `scoop install rust-msvc ffmpeg` or `winget install Rustlang.Rustup Gyan.FFmpeg`
- Cargo workspace resolver: 2, Rust edition: 2021 (MSRV 1.75+)

---

## Feature Inventory

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Cargo Workspace Setup | Root `Cargo.toml` with `engine-lib`, `engine-cli`, `engine-testkit`, pinned deps | M1 | Survey |
| 2 | OutputBackend Trait | Unified sink interface (`open`, `start`, `pause`, `stop`, `stats`) | M1 | Survey / R1 |
| 3 | AudioSpec & Types | Format definitions (`F32`, `I16`, sample rate, channels, telemetry counters) | M1 | Survey / R1 |
| 4 | Symphonia Probing & Decoder | Format probing and decoding for FLAC, WAV, ALAC, MP3, AAC-LC, Vorbis, Opus | M1 | Survey / R1 |
| 5 | Unsupported Profile Rejection | Gracefully reject unsupported AAC profiles (e.g. HE-AAC with SBR/PS) without panics | M1 | Survey / R1 |
| 6 | Bounded SPSC Ring Buffer | Thread-safe, lock-free `rtrb` buffer sized for 2–4s audio with producer backpressure | M1 | Survey / R1 |
| 7 | Monotonic Sample Playhead | Playback position derived from atomic samples consumed counter | M1 | Survey / R1 |
| 8 | Continuous Silence Pause | Stream remains active and emits silence to prevent hardware clicks/latency | M1 | Survey / R1 |
| 9 | WavSink Offline Sink | Deterministic offline sink rendering 32-bit float WAV file via `hound` | M1 | Survey / R1 |
| 10 | NullSink Headless Sink | High-speed sink tracking xruns, throughput, and buffer low-water marks | M1 | Survey / R1 |
| 11 | C1 Decode Null-Test Harness | Verification harness comparing WavSink output to reference PCM ($null\_diff == 0$) | M1 | Survey / C1 |
| 12 | Synthetic Test Generator | Generates deterministic sine, square, impulse test vectors in testkit | M1 | Survey / Testkit |
| 13 | Dual Voice Slots (Slot A / B) | Independent voice slots with separate decoders, ring buffers, and state trackers | M2 | Survey / R2 |
| 14 | LAME Xing/Info Tag Parsing | Extract encoder delay and end padding frames from MP3 headers | M2 | Survey / R2 |
| 15 | Apple iTunSMPB Atom Parsing | Parse 12-token hex comments/atoms in M4A/MP3 tags for delay, padding, valid frames | M2 | Survey / R2 |
| 16 | Pre-Resampling Sample Trimming | Discard leading delay and cap trailing padding in native frames prior to resampler | M2 | Survey / R2 |
| 17 | Gapless Configuration Modes | Support `gapless_trim: auto|metadata|off` modes | M2 | Survey / R2 |
| 18 | Seamless Slot Splice Engine | Frame-accurate track transition across buffer boundary with zero missing/duplicate samples | M2 | Survey / R2 |
| 19 | C2 Gapless Splice Audit Harness | Test harness verifying concatenated gapless splice byte-matches continuous PCM | M2 | Survey / C2 |
| 20 | Equal-Power Crossfader | Quarter-sine per-sample curves ($g_A = \cos(\theta), g_B = \sin(\theta)$) on audio thread | M3 | Survey / R2 |
| 21 | Ordered DSP Pipeline Engine | Fixed order: Mixer -> ReplayGain -> 10-Band EQ -> Karaoke -> Limiter -> Conversion | M3 | Survey / R2 |
| 22 | ReplayGain Processor | Accurate decibel to linear amplitude scaling with clipping prevention | M3 | Survey / R2 |
| 23 | 10-Band Peaking Biquad EQ | ISO octave bands (31Hz to 16kHz), RBJ peaking biquads, gains -24dB to +24dB | M3 | Survey / R2 |
| 24 | Mid-Side Karaoke Processor | M/S decomposition, center-channel vocal attenuation with vocal bandpass filter | M3 | Survey / R2 |
| 25 | 5ms Lookahead Peak Limiter | Circular delay line lookahead, smooth gain reduction, zero clipping distortion | M3 | Survey / R2 |
| 26 | Strict DSP Bypass Mode | Zero-latency bit-transparent passthrough when rate matches and volume is 1.0 | M3 | Survey / R2 |
| 27 | C3 Discontinuity Detector | Automated second-difference ($|\Delta^2 s[n]| < 0.05$) and RMS continuity verification | M3 | Survey / C3 |
| 28 | CpalBackend Live Output | Real-time CPAL stream implementation on WASAPI/system output | M4 | Survey / R1 |
| 29 | Multi-Format F32 & I16 Output | F32 normalized output & I16 quantized output | M4 | Survey / R1 |
| 30 | Lock-Free TPDF Dither | Allocation-free 2-LSB triangular PDF dither for I16 via XorShift32 PRNG | M4 | Survey / R1 |
| 31 | Device Lifecycle State Machine | Detects disconnection/sleep/endpoint change, pauses, and recovers automatically | M4 | Survey / R1 |
| 32 | Mock Error Injection Framework | Test harness simulating device disconnection, buffer underruns, and OS sleep/resume | M4 | Survey / R1 |
| 33 | JSON-Lines Stdio Daemon Protocol | Stdio control interface with line-delimited JSON commands & push events | M5 | Survey / R3 |
| 34 | Daemon 13-Command Schema | `load`, `preload`, `play`, `pause`, `stop`, `seek`, `crossfade`, `set_volume`, `set_eq`, `set_dsp`, `list_devices`, `set_device`, `get_state` | M5 | Survey / R3 |
| 35 | Daemon 5-Event Schema | `state_changed`, `eos`, `xrun`, `device_error`, `heartbeat` | M5 | Survey / R3 |
| 36 | 4Hz Monotonic Heartbeat | Periodic playhead position broadcast with monotonic timestamps for rAF interpolation | M5 | Survey / R3 |
| 37 | C4 Bounded Memory Soak Suite | 10-minute soak test at 192kHz/24-bit FLAC verifying RSS <= 40MB and xruns == 0 | M5 | Survey / C4 |
| 38 | C5 Seek Turnaround Benchmark | Automated test verifying seek command turnaround latency <= 30ms on local SSD files | M5 | Survey / C5 |
| 39 | E2E Testing Suite (Tiers 1-4) | Comprehensive opaque-box test runner covering all features and combinations | E2E | Survey / E2E |
| 40 | Adversarial Coverage Hardening | Tier 5 white-box adversarial stress tests and gap closure | Final | Survey / Final |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Core Decode & Offline Sinks | Cargo workspace setup, Symphonia decoder, `rtrb` SPSC buffer, `WavSink`, `NullSink`, C1 decode null-test (Features 1-12) | none | IN_PROGRESS |
| M2 | Dual-Slot Mixer & True Gapless | Slot A / Slot B state machines, LAME/iTunSMPB trimming before resampling, seamless track splice engine, C2 splice audit (Features 13-19) | M1 | PLANNED |
| M3 | DSP Chain & Click-Free Crossfades | Equal-power crossfader, ReplayGain, 10-band EQ, Mid-Side karaoke, 5ms limiter, bypass mode, C3 discontinuity detector (Features 20-27) | M2 | PLANNED |
| M4 | CPAL Live Output & Device Lifecycle | `CpalBackend`, F32/I16 formats, TPDF dither, silence pause, device disconnect/sleep recovery state machine, mock error injection (Features 28-32) | M1 | PLANNED |
| M5 | Daemon Protocol & Soak Harness | `engine-cli`, stdio JSON-lines protocol (13 cmds, 5 events), 4Hz heartbeats, C4 soak test (RSS <= 40MB, 0 xruns), C5 seek latency <= 30ms (Features 33-38) | M3, M4 | PLANNED |
| E2E | Opaque-Box E2E Test Suite | Test runner harness, synthetic fixtures, Tier 1-4 requirement-driven test cases, `TEST_READY.md` (Feature 39) | none (independent) | PLANNED |
| Final | Full Integration & Adversarial Hardening | Pass 100% E2E test suite (Tiers 1-4) + Tier 5 adversarial stress testing & Victory Audit (Feature 40) | M5, E2E | PLANNED |

---

## Interface Contracts

### 1. `engine-lib` ↔ `engine-cli`
- Control messages sent across bounded async crossbeam/mpsc channels:
  - `Command`: Enum encoding the 13 CLI commands (`Load { slot, path }`, `Seek { position_secs }`, etc.).
  - `Event`: Enum encoding the 5 push events (`StateChanged`, `Eos`, `Xrun`, `DeviceError`, `Heartbeat`).
- Thread boundaries: CLI stdio reader loop -> Command Channel -> Engine Controller Actor -> Audio / Sink Thread.
- Error handling: Non-fatal command errors return `{"status": "error", "message": "..."}` on stdout; fatal errors emit `device_error` push events. All logging goes strictly to `stderr`.

### 2. Decoder Thread ↔ Real-Time Mixer/Sink Thread
- SPSC Transport: `rtrb::RingBuffer<f32>` (preallocated capacity for 2–4 seconds of audio).
- Shared Telemetry: `Arc<SharedSinkStats>` using atomic primitives (`AtomicU64`, `AtomicUsize`, `AtomicBool`) with `Ordering::Relaxed` on audio thread and `Ordering::Acquire`/`Release` for state handoffs.
- Invariant: Audio thread NEVER blocks, NEVER allocates, and NEVER locks.

### 3. Slot Handoff ↔ Output Callback
- When `Slot A` hits EOF and `Slot B` is primed, callback drains remaining $K$ samples of `Slot A`, transitions `Slot A` to `Eos`, transitions `Slot B` to `Playing`, and fills remaining $N - K$ samples from `Slot B`.
- Output is continuous and frame-aligned.

---

## Code Layout

```
crates/
├── engine-lib/
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       ├── types.rs             # AudioSpec, SampleType, Telemetry, Error types
│       ├── decoder/             # Symphonia format probing, decoding, packet staging
│       │   ├── mod.rs
│       │   ├── probe.rs
│       │   └── gapless.rs       # LAME Xing & iTunSMPB metadata parser and trimmer
│       ├── buffer/              # SPSC ring buffer wrappers around rtrb
│       │   └── mod.rs
│       ├── mixer/               # Dual-slot mixer, slot state machine, equal-power crossfader
│       │   ├── mod.rs
│       │   ├── slot.rs
│       │   └── crossfade.rs
│       ├── dsp/                 # DSP chain stages
│       │   ├── mod.rs
│       │   ├── chain.rs
│       │   ├── replaygain.rs
│       │   ├── eq.rs            # 10-band peaking biquad EQ
│       │   ├── karaoke.rs       # Mid-side karaoke vocal remover
│       │   └── limiter.rs       # 5ms lookahead peak limiter
│       └── sink/                # OutputBackend implementations
│           ├── mod.rs
│           ├── wav.rs           # WavSink (hound 32-bit float writer)
│           ├── null.rs          # NullSink (telemetry tracker)
│           └── cpal.rs          # CpalBackend (WASAPI/live output, TPDF dither, lifecycle)
├── engine-cli/
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs
│       ├── protocol.rs          # JSON-lines command and event serde schemas
│       ├── daemon.rs            # stdio loop, actor dispatch, 4Hz heartbeat timer
│       └── logger.rs            # stderr logger configuration
└── engine-testkit/
    ├── Cargo.toml
    ├── src/
    │   ├── lib.rs
    │   ├── generator.rs         # Synthetic sine, square, impulse audio generator
    │   ├── c1_null_test.rs      # Bit-accurate decode null-test verification
    │   ├── c2_splice_audit.rs   # Gapless splice boundary auditor
    │   ├── c3_crossfade_audit.rs# Second-difference and RMS continuity detector
    │   ├── c4_soak_test.rs      # 10-minute 192kHz/24-bit soak test & memory monitor
    │   └── c5_seek_latency.rs   # Sub-30ms seek latency benchmark
    └── tests/
        ├── m1_tests.rs
        ├── m2_tests.rs
        ├── m3_tests.rs
        ├── m4_tests.rs
        └── m5_tests.rs
```
