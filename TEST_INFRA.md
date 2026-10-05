# TEST_INFRA.md — Nora Native Rust Audio Engine Test Infrastructure

## 1. Overview & Architectural Philosophy

The Nora Native Rust Audio Engine test infrastructure provides a rigorous, requirement-driven, opaque-box verification framework for the audio subsystem (`crates/engine-lib`, `crates/engine-cli`, `crates/engine-testkit`).

### Core Testing Invariants
1. **Opaque-Box Requirement Derivation**: Tests treat internal components as black boxes, driving behavior purely via public APIs, traits (`OutputBackend`, `AudioSource`, `AudioDecoder`), and the stdio JSON-lines protocol.
2. **Deterministic & Headless by Default**: All core test tiers execute without requiring physical audio hardware or OS audio endpoint permissions by leveraging `WavSink` (offline bit-accurate rendering) and `NullSink` (high-speed headless telemetry sink).
3. **Bit-Accuracy & Mathematical Oracles**: Expected outputs are derived from authoritative mathematical principles (Nyquist-Shannon sampling, trigonometric equal-power identities $\cos^2(\theta) + \sin^2(\theta) = 1$, discrete second-difference continuity $|\Delta^2 s[n]| < 0.05$) or bit-accurate reference decodes.
4. **Real-Time Safety & Allocation Prohibition**: Test fixtures verify that the audio callback path never allocates dynamic memory, never acquires mutexes, never invokes syscalls, and never panics.

---

## 2. Cargo Workspace Test Harness Layout

The testkit is isolated in `crates/engine-testkit`, keeping test fixtures, synthetic audio generators, and audit tooling separate from production binaries.

```
crates/engine-testkit/
├── Cargo.toml
├── src/
│   ├── lib.rs                   # Re-exports testkit components
│   ├── generator.rs             # Synthetic audio generators (sine, square, impulse, silence, sweep)
│   ├── wav_fixture.rs           # Programmatic in-memory / temporary WAV file builder
│   ├── c1_null_test.rs          # Bit-accurate decode null-test auditor
│   ├── c2_splice_audit.rs       # Gapless splice boundary auditor (zero missing/duplicate samples)
│   ├── c3_crossfade_audit.rs    # Click-free crossfade second-difference & RMS continuity auditor
│   ├── c4_soak_test.rs          # Bounded memory RSS and xrun telemetry monitor
│   ├── c5_seek_latency.rs       # Seek turnaround latency benchmark
│   └── mock_backend.rs          # Mock CPAL device backend with error injection
└── tests/
    ├── tier1_features/          # Tier 1: Feature Coverage (>=5 tests per feature)
    │   ├── r1_streaming_sinks.rs
    │   ├── r1_decoder_probing.rs
    │   ├── r2_mixer_gapless.rs
    │   ├── r2_dsp_pipeline.rs
    │   ├── r3_daemon_protocol.rs
    │   └── r1_device_lifecycle.rs
    ├── tier2_boundaries/        # Tier 2: Boundary & Corner Cases (>=5 tests per feature)
    │   ├── boundary_rates_channels.rs
    │   ├── boundary_zero_empty.rs
    │   ├── boundary_ringbuffer.rs
    │   ├── boundary_dsp_extremes.rs
    │   └── boundary_daemon_stress.rs
    ├── tier3_combinations/      # Tier 3: Cross-Feature Pairwise Interactions
    │   ├── crossfade_with_dsp.rs
    │   ├── seek_during_transitions.rs
    │   ├── bypass_with_volume.rs
    │   ├── dither_with_limiter.rs
    │   └── preload_under_load.rs
    └── tier4_scenarios/         # Tier 4: Real-World Complex Scenarios
        ├── scenario1_album_gapless.rs
        ├── scenario2_dj_crossfade_cue.rs
        ├── scenario3_scrub_storm.rs
        ├── scenario4_dynamic_dsp_presets.rs
        └── scenario5_headless_telemetry_soak.rs
```

---

## 3. 4-Tier Test Taxonomy

### Tier 1: Feature Coverage (Requirement Verification)
Ensures every functional requirement in R1, R2, R3, and Acceptance Criteria C1–C5 has at least 5 distinct, high-coverage verification tests.
- **R1: Non-Blocking Streaming & Sinks**:
  - `OutputBackend` contract conformance across `WavSink`, `NullSink`, and `CpalBackend`.
  - Symphonia format probing (FLAC, WAV, MP3, AAC-LC, Vorbis, Opus).
  - Graceful rejection of unsupported profiles (HE-AAC with SBR/PS).
  - Lock-free SPSC `rtrb` ring buffer stream pacing and bounded memory.
  - Monotonic playhead counter driven strictly by output-consumed frames.
  - Continuous silence emission during pause.
- **R2: Dual-Slot Mixer & DSP Chain**:
  - Independent Slot A and Slot B state machines (`Empty`, `Primed`, `Playing`, `Paused`, `Eos`).
  - LAME Xing/Info tag parsing for encoder delay and end padding trimming.
  - Apple `iTunSMPB` hex atom parsing.
  - Equal-power quarter-sine crossfade ($g_A = \cos(\theta), g_B = \sin(\theta)$).
  - Fixed-order DSP chain: ReplayGain $\to$ 10-Band EQ $\to$ Mid-Side Karaoke $\to$ 5ms Lookahead Limiter.
  - Strict bypass definition (bit-transparent passthrough at native sample rate and unity gain).
- **R3: JSON-Lines Daemon Protocol**:
  - 13 CLI commands serialization/deserialization and execution.
  - 5 asynchronous push events schema compliance.
  - 4Hz periodic monotonic heartbeat emission.
  - Error schema emission and logging separation (stdio JSON vs stderr diagnostics).

### Tier 2: Boundary & Corner Cases
Stress tests and boundary condition enforcement:
- Sample rates: extreme values (8,000 Hz, 11,025 Hz, 44,100 Hz, 48,000 Hz, 96,000 Hz, 192,000 Hz, 384,000 Hz).
- Channel configurations: Mono (1ch), Stereo (2ch).
- Zero-length audio streams, empty files, corrupt headers, truncated frames.
- SPSC ring buffer full, empty, wrap-around pointer boundaries, and low-water mark reset.
- Boundary seek targets: `0.0s`, `duration - eps`, `duration`, `duration + 10s`, negative seek.
- Zero-length crossfade (0ms), single-frame crossfade, crossfade duration exceeding track duration.
- DSP extremes: $\pm 24\text{ dB}$ EQ gains, $+20\text{ dB}$ ReplayGain with peak limiter suppression, total center cancellation in Mid-Side.
- Dither noise floor and DC offset linearity under low-bitrate I16 quantization.

### Tier 3: Cross-Feature Combinations
Pairwise feature interaction matrix verifying that features do not mutate or corrupt shared state:
1. Crossfade actively transitioning from Slot A to Slot B while 10-Band EQ and ReplayGain are active.
2. Seek command received precisely mid-crossfade.
3. DSP bypass toggled between Processed and Bypassed during active playback at non-unity volume.
4. Continuous pause engaged while Mid-Side Karaoke vocal attenuator is processing.
5. Format conversion to I16 with TPDF dither while 5ms Lookahead Limiter is actively attenuating peaks.
6. Sample rate adaptation (resampling) occurring concurrently with gapless encoder delay trimming.
7. Device disconnect error injected during an active slot handoff or crossfade.
8. Background preload of Slot B while Slot A is streaming 192kHz/24-bit audio under backpressure.

### Tier 4: Real-World Application Scenarios
End-to-end integration scenarios simulating actual user listening and player lifecycles:
1. **Scenario 1 — Seamless Album Gapless Sequence**: 5 continuous album tracks played back-to-back through `WavSink`, verifying zero sample gaps or duplication across all 4 transitions.
2. **Scenario 2 — Interactive DJ Crossfade & Cueing**: Track A playing $\to$ Preload Track B $\to$ Trigger 3s crossfade $\to$ Retarget/Preload Track C $\to$ Immediate crossfade $\to$ Monotonic playhead continuity check.
3. **Scenario 3 — Aggressive Scrub Storm**: Rapid random seeking across an audio track (50 seek operations in 500ms) verifying buffer flushes, zero desync, zero memory leaks, and prompt recovery.
4. **Scenario 4 — Dynamic DSP Preset Morphing**: Rapid real-time toggling between Flat, Club Bass Boost, Acoustic Vocal, Karaoke, and Bypass modes without audible clicks, discontinuities, or memory reallocation.
5. **Scenario 5 — Headless Telemetry Soak**: Long-duration multi-track playback through `NullSink` under synthetic thread jitter, monitoring memory RSS ($\le 40\text{ MB}$), zero underruns (`xrun == 0`), and accurate low-water mark telemetry.

---

## 4. Test Oracles & Audit Mathematical Formulations

### C1. Bit-Accurate Decode Null-Test Oracle
Given decoded PCM samples $s_{\text{test}}[n]$ and reference PCM samples $s_{\text{ref}}[n]$:
$$\text{Null Difference} = \sum_{n=0}^{N-1} |s_{\text{test}}[n] - s_{\text{ref}}[n]| == 0.0$$
In strict bypass mode at native sample rate, the rendered WAV must match reference float PCM byte-for-byte.

### C2. Gapless Splice Audit Oracle
Given an original uninterrupted test signal $S[n]$ split into track parts $T_1[n]$ and $T_2[n]$ with encoder delay $D$ and padding $P$:
$$S_{\text{concatenated}}[n] = \text{Trim}(T_1) \mathbin{\Vert} \text{Trim}(T_2)$$
$$\max_{0 \le n < N} |S_{\text{concatenated}}[n] - S[n]| \le 10^{-6}$$
Number of output samples must equal original input samples with zero phase shift at the boundary.

### C3. Click-Free Crossfade Second-Difference Continuity Oracle
For every sample $n$ in the transition window:
$$\Delta^2 s[n] = s[n] - 2s[n-1] + s[n-2]$$
$$\max_n |\Delta^2 s[n]| < \tau \quad (\tau = 0.05)$$
RMS power continuity across sliding 10ms windows:
$$\left| \text{RMS}_{w}[k] - \text{RMS}_{w}[k-1] \right| < \epsilon_{\text{RMS}}$$

### C4. Bounded Memory RSS & Underrun Oracle
During continuous playback:
$$\text{Peak RSS} \le 40 \times 1024 \times 1024 \text{ bytes}$$
$$\text{Total Xruns} == 0$$
$$\text{Buffer Low-Water Mark} \ge 0.10 \times \text{Capacity}$$

### C5. Seek Turnaround Latency Oracle
For seek invocation at time $t_0$ and first post-seek audio sample emission at $t_1$:
$$t_1 - t_0 \le 30\text{ ms}$$

---

## 5. Execution Commands & CI Matrix

### Standard Test Execution
```bash
# Run all tests in the testkit crate
cargo test -p engine-testkit

# Run specific tier test suites
cargo test -p engine-testkit --test tier1_features
cargo test -p engine-testkit --test tier2_boundaries
cargo test -p engine-testkit --test tier3_combinations
cargo test -p engine-testkit --test tier4_scenarios

# Run individual acceptance criteria audits
cargo test -p engine-testkit --test c1_null_test
cargo test -p engine-testkit --test c2_splice_audit
cargo test -p engine-testkit --test c3_crossfade_audit
cargo test -p engine-testkit --test c4_soak_test
cargo test -p engine-testkit --test c5_seek_latency
```

### Telemetry & Output Capture
All test runs output real-time diagnostics to stderr while preserving clean test assertion status on stdout. Test outputs may be verified with `cargo test -- --nocapture`.
