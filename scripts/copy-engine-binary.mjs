import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const binDir = path.resolve(rootDir, 'resources', 'bin');

const isWin = process.platform === 'win32';
const binaryName = isWin ? 'engine-cli.exe' : 'engine-cli';
const srcBinary = path.join(rootDir, 'target', 'release', binaryName);
const dstBinary = path.join(binDir, binaryName);

if (!fs.existsSync(srcBinary)) {
  console.warn(`[copy-engine-binary] Source binary not found at ${srcBinary}. Run 'npm run build:engine' first.`);
  process.exit(0);
}

if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
}

fs.copyFileSync(srcBinary, dstBinary);
if (!isWin) {
  fs.chmodSync(dstBinary, 0o755);
}

console.log(`[copy-engine-binary] Copied ${binaryName} to resources/bin/ successfully.`);
