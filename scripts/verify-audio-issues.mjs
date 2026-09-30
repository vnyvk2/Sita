import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const binaryPath = path.join(rootDir, 'resources', 'bin', 'engine-cli.exe');

// We test with two real files or test audio if available
// Let's use a real audio file from the user's music directory
const testAudioPath = 'D:/Music/Shiro SAGISU/劇場版BLEACH 地獄篇 Original Soundtrack/17 - 4BLM_101_Chokkaku.m4a';

async function runEmpiricalDiagnostic() {
  console.log('================================================================');
  console.log('EMPIRICAL DIAGNOSTIC: NATIVE AUDIO ENGINE PROTOCOL & DAEMON AUDIT');
  console.log('================================================================');
  console.log('Binary path:', binaryPath);
  console.log('Audio file:', testAudioPath);

  const proc = spawn(binaryPath, [], {
    cwd: rootDir,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const rl = readline.createInterface({ input: proc.stdout });

  const events = [];
  rl.on('line', (line) => {
    try {
      const parsed = JSON.parse(line);
      events.push({ time: Date.now(), data: parsed });
      if (parsed.event === 'heartbeat') {
        console.log(`[DAEMON HEARTBEAT] pos: ${parsed.position_secs.toFixed(3)}s | dur: ${parsed.duration_secs.toFixed(3)}s | active: ${parsed.active_slot}`);
      } else {
        console.log(`[DAEMON EVENT/RESP]`, JSON.stringify(parsed));
      }
    } catch {
      console.log(`[RAW STDOUT]`, line);
    }
  });

  proc.stderr.on('data', (d) => {
    // console.log(`[STDERR]`, d.toString().trim());
  });

  function send(obj) {
    const json = JSON.stringify(obj);
    console.log(`\n>>> [SENDING COMMAND]`, json);
    proc.stdin.write(json + '\n');
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // 1. Wait for Ready event
  await sleep(400);

  // 2. Load Track 1 into Slot A
  send({ id: 1, cmd: 'load', slot: 'a', path: testAudioPath });
  await sleep(400);

  // 3. Play Track 1
  send({ id: 2, cmd: 'play' });
  console.log('\n--- Playing Track 1 for 3 seconds to accumulate frames ---');
  await sleep(3000);

  // 4. TEST ISSUE 1: Seek to 60.0s
  console.log('\n======================================================');
  console.log('TEST 1: ATTEMPTING SEEK TO 60.0 SECONDS');
  console.log('======================================================');
  send({ id: 3, cmd: 'seek', position_secs: 60.0 });
  await sleep(1500);

  // 5. TEST ISSUE 2: Skip to next song (re-load Slot A with new track / same track)
  console.log('\n======================================================');
  console.log('TEST 2: SKIP TO NEXT SONG (LOAD TRACK FROM BEGINNING)');
  console.log('======================================================');
  send({ id: 4, cmd: 'load', slot: 'a', path: testAudioPath });
  send({ id: 5, cmd: 'play' });
  console.log('\n--- Playing for 2 seconds after Skip ---');
  await sleep(2000);

  // Clean shutdown
  send({ id: 6, cmd: 'stop' });
  await sleep(300);
  proc.kill();

  console.log('\n======================================================');
  console.log('DIAGNOSTIC SUMMARY & ANALYSIS OF RECORDED EVENTS:');
  console.log('======================================================');

  // Analyze seek
  const heartbeatsAfterSeek = events.filter(e => e.data.event === 'heartbeat' && e.data.wallclock_ms > 3000 && e.data.wallclock_ms < 5000);
  console.log(`Heartbeats after seek command was sent (expected ~60s if seeking worked):`);
  heartbeatsAfterSeek.slice(0, 4).forEach(h => {
    console.log(`  wallclock: ${h.data.wallclock_ms}ms, reported position: ${h.data.position_secs.toFixed(3)}s`);
  });

  // Analyze skip
  const heartbeatsAfterSkip = events.filter(e => e.data.event === 'heartbeat' && e.data.wallclock_ms > 5000);
  console.log(`\nHeartbeats after skip (loading new song) (expected ~0.25s - 1.0s if reset):`);
  heartbeatsAfterSkip.slice(0, 4).forEach(h => {
    console.log(`  wallclock: ${h.data.wallclock_ms}ms, reported position: ${h.data.position_secs.toFixed(3)}s`);
  });

  process.exit(0);
}

runEmpiricalDiagnostic().catch(console.error);
