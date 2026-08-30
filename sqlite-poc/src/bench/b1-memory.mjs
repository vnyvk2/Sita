// Phase 5 — Memory benchmark: baseline / PGlite / node:sqlite process commit.
// Runs each condition in a fresh forked child and samples Windows commit charge
// (PrivateMemorySize64) + child-reported node memory at fixed checkpoints.
// Repeat runs: 3 per condition (median reported per checkpoint).
import { fork } from 'node:child_process';
import path from 'node:path';
import { POC_ROOT, saveResults, envInfo } from '../lib/util.mjs';
import { commitSizeMb } from '../lib/memory.mjs';

const SIZE = 50000;
const RUNS = 3;
const CHILD = path.join(POC_ROOT, 'src', 'bench', 'memory-child.mjs');

async function runCondition(engine) {
  const checkpoints = [];
  const closeTimes = [];
  return new Promise((resolve, reject) => {
    const child = fork(CHILD, [engine, String(SIZE)], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], execArgv: ['--expose-gc'] });
    let err = '';
    child.stderr.on('data', (d) => (err += d));
    child.on('message', async (msg) => {
      if (msg.type === 'checkpoint') {
        const commitMb = await commitSizeMb(child.pid);
        checkpoints.push({ label: msg.label, commitMb, ...msg.mem });
        console.log(`    [${engine}] ${msg.label}: commit=${commitMb}MB rss=${msg.mem.rssMb}MB heapUsed=${msg.mem.heapUsedMb}MB external=${msg.mem.externalMb}MB arrBuf=${msg.mem.arrayBuffersMb}MB`);
      } else if (msg.type === 'closeMs') {
        closeTimes.push(msg.closeMs);
      } else if (msg.type === 'done') {
        child.kill();
        resolve({ checkpoints, closeTimes });
      }
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`memory child timeout (${engine}): ${err}`));
    }, 600000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0 && code !== null) reject(new Error(`memory child exit ${code}: ${err}`));
    });
  });
}

const out = {};
for (const engine of ['baseline', 'sqlite', 'pglite']) {
  console.log(`\n=== ${engine} @${SIZE} ===`);
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    console.log(`  run ${i + 1}:`);
    runs.push(await runCondition(engine));
  }
  // median per checkpoint label
  const labels = runs[0].checkpoints.map((c) => c.label);
  out[engine] = {
    runs,
    medians: Object.fromEntries(
      labels.map((label) => {
        const vals = runs.map((r) => r.checkpoints.find((c) => c.label === label)).filter(Boolean);
        const commit = vals.map((v) => v.commitMb).filter((v) => v != null).sort((a, b) => a - b);
        return [label, { commitMbMedian: commit.length ? commit[Math.floor(commit.length / 2)] : null, commitMbMin: commit[0] ?? null, commitMbMax: commit[commit.length - 1] ?? null }];
      })
    )
  };
}

// headline deltas (idle-after-init and after-engine-open vs baseline)
const baseIdle = out.baseline.medians['idle-after-init'].commitMbMedian
  ?? out.baseline.medians['after-noop-open'].commitMbMedian;
for (const eng of ['sqlite', 'pglite']) {
  const idle = out[eng].medians['idle-after-init'].commitMbMedian;
  const open = out[eng].medians['after-engine-open'].commitMbMedian;
  out[eng].deltaVsBaseline = {
    afterEngineOpenMb: open != null && baseIdle != null ? Math.round((open - baseIdle) * 10) / 10 : null,
    idleAfterInitMb: idle != null && baseIdle != null ? Math.round((idle - baseIdle) * 10) / 10 : null
  };
  console.log(`\n>> ${eng}: +${out[eng].deltaVsBaseline.afterEngineOpenMb}MB commit after engine open, +${out[eng].deltaVsBaseline.idleAfterInitMb}MB idle vs baseline (${baseIdle}MB)`);
}

await saveResults('memory', { size: SIZE, runs: RUNS, method: 'forked child; commit via Get-Process PrivateMemorySize64', env: envInfo(), results: out });
