/**
 * Regenerates the deterministic audio fixtures consumed by
 * `crates/engine-testkit/tests/real_codec_tests.rs` and
 * `crates/engine-cli/tests/daemon_stdio.rs`.
 *
 * Why this exists: `target/test_fixtures/*` is git-ignored, so CI and fresh
 * clones cannot run the real-codec gate or the real-binary stdio test
 * without it. Every fixture derives from a local lavfi sine — no network,
 * no blobs — so the gate is reproducible anywhere ffmpeg exists.
 *
 * Fixture set (all 48 kHz, matching the engine's pairwise contracts):
 * - ref_440hz_3s.wav  stereo f32le 440 Hz × 3 s (null-test reference)
 * - flac16_stereo.flac / flac24_stereo.flac / alac16_stereo.m4a (lossless)
 * - lame_stereo.mp3 + lame_ffmpeg_ref.raw (MP3 parity pair)
 * - aac_stereo.m4a + aac_ffmpeg_ref.raw (AAC parity pair)
 * - split_part{1,2}.wav (mono f32le tone halves) + .mp3 (gapless pair)
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '..', 'target', 'test_fixtures');

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: 'inherit'
  });
  if (r.status !== 0) {
    console.error(`[gen-fixtures] FAILED: ffmpeg ${args.join(' ')}`);
    process.exit(1);
  }
}

function checkFfmpeg() {
  const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  if (r.status !== 0) {
    console.error('[gen-fixtures] ffmpeg not found on PATH; cannot generate fixtures.');
    process.exit(1);
  }
}

checkFfmpeg();
fs.mkdirSync(outDir, { recursive: true });
const out = (n) => path.join(outDir, n);

// 1. Reference: stereo 440 Hz sine, 3 s, 48 kHz, f32le.
ffmpeg([
  '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3:sample_rate=48000',
  '-ac', '2', '-c:a', 'pcm_f32le', out('ref_440hz_3s.wav')
]);

// 2. Lossless derivations of the reference.
ffmpeg(['-i', out('ref_440hz_3s.wav'), '-c:a', 'flac', '-sample_fmt', 's16', out('flac16_stereo.flac')]);
ffmpeg(['-i', out('ref_440hz_3s.wav'), '-c:a', 'flac', '-sample_fmt', 's32', out('flac24_stereo.flac')]);
ffmpeg(['-i', out('ref_440hz_3s.wav'), '-c:a', 'alac', '-sample_fmt', 's16p', out('alac16_stereo.m4a')]);

// 3. LAME MP3 + ffmpeg-decoded float reference (libmp3lame writes Xing+LAME gapless tags).
ffmpeg(['-i', out('ref_440hz_3s.wav'), '-c:a', 'libmp3lame', '-b:a', '320k', out('lame_stereo.mp3')]);
ffmpeg(['-i', out('lame_stereo.mp3'), '-ac', '2', '-ar', '48000', '-c:a', 'pcm_f32le', '-f', 'f32le', out('lame_ffmpeg_ref.raw')]);

// 4. AAC-LC + float reference.
ffmpeg(['-i', out('ref_440hz_3s.wav'), '-c:a', 'aac', '-b:a', '192k', out('aac_stereo.m4a')]);
ffmpeg(['-i', out('aac_stereo.m4a'), '-ac', '2', '-ar', '48000', '-c:a', 'pcm_f32le', '-f', 'f32le', out('aac_ffmpeg_ref.raw')]);

// 5. Split pair: two distinct mono tones so a splice boundary is meaningful.
for (const [freq, part] of [[440, 'split_part1'], [660, 'split_part2']]) {
  ffmpeg([
    '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=1.5:sample_rate=48000`,
    '-ac', '1', '-c:a', 'pcm_f32le', out(`${part}.wav`)
  ]);
  ffmpeg(['-i', out(`${part}.wav`), '-c:a', 'libmp3lame', '-b:a', '320k', out(`${part}.mp3`)]);
}

console.log(`[gen-fixtures] wrote ${fs.readdirSync(outDir).length} fixtures to ${outDir}`);
