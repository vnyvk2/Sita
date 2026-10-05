/**
 * REPRODUCTION SCRIPT: TEAM02-001 (CRITICAL)
 * Crash Limit Suppression Bypass in MediaWorkerBridge
 *
 * Demonstrates that when MediaWorkerBridge reaches its crash limit (4 crashes in 60s)
 * and enters state 'CRASHED' with auto-restart suppressed, calling start()
 * (which is done automatically by any subsequent job: generateAsset, walkDirectory, etc.)
 * completely bypasses the crash limit and immediately restarts the process.
 */

import { EventEmitter } from 'events';

class MockUtilityProcess extends EventEmitter {
  pid = 12345;
  kill() {
    this.emit('exit', 1);
  }
}

// Minimal reproduction model of MediaWorkerBridge crash tracking & start logic
class MediaWorkerBridgeModel extends EventEmitter {
  state = 'UNINITIALIZED';
  crashTimestamps = [];
  consecutiveCrashCount = 0;
  MAX_CRASHES_PER_MINUTE = 3;
  restartTimer = null;
  startPromise = null;
  childProcess = null;
  spawnCount = 0;

  isReady() {
    return this.state === 'READY' && this.childProcess !== null;
  }

  async start(timeoutMs = 5000) {
    if (this.state === 'READY' && this.childProcess) return;

    if (this.state === 'TERMINATED') {
      this.state = 'UNINITIALIZED';
    }

    if (this.state === 'READY' && this.childProcess) return;

    if (this.startPromise) return this.startPromise;

    // FLAW: start() does NOT check if this.state === 'CRASHED' or if crash limit is exceeded!
    this.startPromise = this.executeStart(timeoutMs).finally(() => {
      this.startPromise = null;
    });

    return this.startPromise;
  }

  async executeStart(timeoutMs) {
    this.state = 'STARTING';
    this.spawnCount++;
    this.childProcess = new MockUtilityProcess();
    return Promise.resolve();
  }

  handleWorkerExit(code) {
    const wasDraining = this.state === 'DRAINING' || this.state === 'TERMINATED';
    this.childProcess = null;

    if (!wasDraining) {
      const now = Date.now();
      this.crashTimestamps = this.crashTimestamps.filter((ts) => now - ts < 60000);
      this.crashTimestamps.push(now);

      if (this.crashTimestamps.length > this.MAX_CRASHES_PER_MINUTE) {
        this.state = 'CRASHED';
        // "Auto-restart suppressed"
        return;
      }

      this.consecutiveCrashCount++;
      this.state = 'STARTING';
      // Schedules auto restart...
    }
  }

  async generateAsset() {
    if (this.state !== 'READY') {
      await this.start();
    }
  }
}

async function run() {
  const bridge = new MediaWorkerBridgeModel();

  console.log('--- Step 1: Simulate 4 consecutive crashes ---');
  for (let i = 1; i <= 4; i++) {
    bridge.handleWorkerExit(1);
    console.log(`Crash #${i}: state = '${bridge.state}', crashTimestamps = ${bridge.crashTimestamps.length}`);
  }

  console.log('\n--- Step 2: Verify state is CRASHED and auto-restart is suppressed ---');
  if (bridge.state !== 'CRASHED') {
    throw new Error(`Expected state to be CRASHED, got ${bridge.state}`);
  }
  console.log(`State is successfully '${bridge.state}'. Auto-restart timer was suppressed.`);

  console.log('\n--- Step 3: Incoming job calls generateAsset() (which calls start()) ---');
  console.log(`Spawn count before job: ${bridge.spawnCount}`);
  await bridge.generateAsset();
  console.log(`Spawn count after job: ${bridge.spawnCount}`);
  console.log(`Bridge state after job: '${bridge.state}'`);

  if (bridge.spawnCount > 0 && bridge.state !== 'CRASHED') {
    console.log('\n[CRITICAL BUG CONFIRMED] Calling start() or generateAsset() completely bypassed the CRASHED state!');
    console.log(`The CRASHED state was wiped out to '${bridge.state}' and a new child process was spawned.`);
  } else {
    console.log('Crash limit was respected.');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
