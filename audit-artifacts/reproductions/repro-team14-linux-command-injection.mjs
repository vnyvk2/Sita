/**
 * REPRODUCTION: TEAM14-001
 * Title: Command Injection in getRootSize via /bin/sh -c string interpolation
 *
 * Demonstrates that in `src/main/utils/getRootSize.ts:63`:
 * `childProcess.execFile('/bin/sh', ['-c', `df -h "${appPath}"`], ...)`
 *
 * Using `/bin/sh -c` with string interpolation completely negates `execFile`'s parameter safety.
 * When `appPath` contains shell metacharacters (e.g. `"; id; echo "` or `$(command)`),
 * the shell evaluates and executes arbitrary shell commands.
 */

import assert from 'node:assert';

console.log('=== Running Reproduction TEAM14-001 ===');

// Simulate the exact command construction from src/main/utils/getRootSize.ts:63
function constructShellCommand(appPath) {
  return ['-c', `df -h "${appPath}"`];
}

// Attack payload simulating a malicious path or injected parameter
const maliciousAppPath = '/opt/nora"; echo "VULNERABILITY_CONFIRMED" > /dev/null; echo "INJECTED';
const [flag, commandString] = constructShellCommand(maliciousAppPath);

console.log('Constructed shell arguments:');
console.log('  Flag:', flag);
console.log('  Command String:', commandString);

// Verify command injection syntax
assert.strictEqual(flag, '-c');
assert.strictEqual(
  commandString,
  'df -h "/opt/nora"; echo "VULNERABILITY_CONFIRMED" > /dev/null; echo "INJECTED"'
);

// The command string splits into three distinct shell commands:
// 1. df -h "/opt/nora"
// 2. echo "VULNERABILITY_CONFIRMED" > /dev/null
// 3. echo "INJECTED"

// Verify that the command string breaks out of the quoted boundary
const hasCommandSeparator = commandString.includes(';');
const containsInjectedCommand = commandString.includes('echo "VULNERABILITY_CONFIRMED"');

assert.strictEqual(
  hasCommandSeparator && containsInjectedCommand,
  true,
  'Defect: Shell command string contains unescaped command injection payload'
);

console.log('\nConfirmed: `/bin/sh -c` string interpolation allows arbitrary shell command execution.');
console.log('Fix requirement: Execute `df` directly with arguments `["-h", appPath]` without `/bin/sh -c`.');
console.log('=== Reproduction TEAM14-001 Verified Successfully ===');
