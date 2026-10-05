/**
 * REPRODUCTION SCRIPT: TEAM02-005 (HIGH)
 * Sub-400ms Audio File Zero-Byte Loudness Cache Permanently Blocks Album ReplayGain Aggregation
 *
 * Demonstrates:
 * 1. BS1770LoudnessEngine on an audio file shorter than 400ms generates 0 blocks (empty Float64Array).
 * 2. assetJobHandler writes this 0-byte buffer to ${songId}_v1.bin.
 * 3. AlbumReplayGainJob validates block cache: if (buf.byteLength === 0) -> logs corruption and returns early.
 * 4. As a result, the album never gets aggregated and the job never succeeds.
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Minimal model of BS1770LoudnessEngine block accumulation for <400ms audio
class MockBS1770LoudnessEngine {
  sampleRate = 44100;
  blockSize = Math.floor(0.4 * 44100); // 17640 frames
  blockEnergies = [];

  processShortAudio(durationMs) {
    const totalFrames = Math.floor((durationMs / 1000) * this.sampleRate);
    // Since totalFrames < blockSize (400ms), 0 blocks are accumulated
    if (totalFrames >= this.blockSize) {
      this.blockEnergies.push(0.05);
    }
  }

  getBlockEnergies() {
    return Float64Array.from(this.blockEnergies);
  }
}

async function run() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nora-replaygain-test-'));
  const destinationPath = path.join(tmpDir, '101_v1.bin');

  console.log('--- Step 1: Process 300ms audio file with BS1770LoudnessEngine ---');
  const engine = new MockBS1770LoudnessEngine();
  engine.processShortAudio(300); // 300ms
  const blockEnergies = engine.getBlockEnergies();
  console.log(`Block energies length: ${blockEnergies.length}, byteLength: ${blockEnergies.byteLength}`);

  console.log('\n--- Step 2: assetJobHandler writes block energies buffer to disk ---');
  const buffer = Buffer.from(blockEnergies.buffer, blockEnergies.byteOffset, blockEnergies.byteLength);
  await fs.writeFile(destinationPath, buffer);
  const fileStat = await fs.stat(destinationPath);
  console.log(`Published cache file: ${destinationPath} (size: ${fileStat.size} bytes)`);

  console.log('\n--- Step 3: AlbumReplayGainJob evaluates the cache file for aggregation ---');
  const buf = await fs.readFile(destinationPath);
  let aggregationBlocked = false;

  // Exact check from AlbumReplayGainJob.ts line 157:
  if (buf.byteLength === 0 || buf.byteLength % 8 !== 0) {
    console.log(`[AlbumReplayGainJob] Corrupt or unaligned loudness block cache for song 101 (${buf.byteLength} bytes). Deferring album aggregation.`);
    aggregationBlocked = true;
  }

  if (aggregationBlocked) {
    console.log('\n[HIGH BUG CONFIRMED] Sub-400ms audio tracks produce 0-byte block caches that permanently block AlbumReplayGainJob!');
  } else {
    console.log('Album aggregation proceeded.');
  }

  await fs.rm(tmpDir, { recursive: true, force: true });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
