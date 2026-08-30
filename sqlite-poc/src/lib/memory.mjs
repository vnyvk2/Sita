// Process memory measurement.
// Windows "commit charge" (Private Bytes) is what matters for Nora's main process —
// Working Set can be trimmed/shared. We read PrivateMemorySize64 via PowerShell
// (Get-Process) as the authoritative commit-size number, with process.memoryUsage()
// captured alongside for heap/external breakdown (PGlite's WASM heap shows up as
// external/arrayBuffers, matching the 281 MB JSArrayBuffer finding in
// architecture/tiny-mini/PHASE_3_MAIN_MEMORY_BREAKDOWN.md).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import process from 'node:process';

const execFileAsync = promisify(execFile);

/** node-level memory view of the current process. */
export function selfMemory() {
  const mu = process.memoryUsage();
  return {
    pid: process.pid,
    rssMb: mb(mu.rss),
    heapUsedMb: mb(mu.heapUsed),
    heapTotalMb: mb(mu.heapTotal),
    externalMb: mb(mu.external),
    arrayBuffersMb: mb(mu.arrayBuffers)
  };
}

const mb = (v) => Math.round((v / 1024 / 1024) * 10) / 10;

/**
 * Commit size (Private Bytes) for an arbitrary pid via PowerShell.
 * Returns MB, or null if unavailable.
 */
export async function commitSizeMb(pid) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-Command', `(Get-Process -Id ${pid}).PrivateMemorySize64`],
        { timeout: 15000, windowsHide: true }
      );
      const bytes = Number(stdout.trim());
      if (Number.isFinite(bytes) && bytes > 0) return mb(bytes);
    } catch { /* retry once */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

/** Full checkpoint: self node metrics + commit size for a pid (self or child). */
export async function checkpoint(label, pid = process.pid) {
  const self = pid === process.pid ? selfMemory() : null;
  const commitMb = await commitSizeMb(pid);
  const entry = { label, pid, commitMb, ...(self ?? {}) };
  console.log(`  [mem] ${JSON.stringify(entry)}`);
  return entry;
}
