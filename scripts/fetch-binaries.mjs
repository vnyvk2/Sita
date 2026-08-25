/**
 * Fetches the external binaries required by the online download feature:
 *   - yt-dlp  (search/stream extraction backend)
 *   - ffmpeg + ffprobe (reserved for edge cases; not used in the normal download path)
 *
 * Binaries are placed in resources/bin/ which is gitignored and included in packaged
 * builds through the existing `asarUnpack: resources/**` rule.
 *
 * Usage:
 *   node scripts/fetch-binaries.mjs            # skips anything already present
 *   node scripts/fetch-binaries.mjs --force    # re-downloads even if present
 *
 * Optional pin (falls back to latest release when unset):
 *   NORA_YTDLP_VERSION=2025.06.30   (a release tag of yt-dlp/yt-dlp)
 */

import { spawnSync } from 'child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync
} from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN_DIR = path.resolve(__dirname, '..', 'resources', 'bin');

const FORCE = process.argv.includes('--force');
const YTDLP_VERSION = process.env.NORA_YTDLP_VERSION;
const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const EXT = IS_WIN ? '.exe' : '';

function ytdlpUrl() {
  const base = YTDLP_VERSION
    ? `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}`
    : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
  if (IS_WIN) return `${base}/yt-dlp.exe`;
  if (IS_MAC) return `${base}/yt-dlp_macos`;
  return `${base}/yt-dlp_linux`;
}

function ffmpegArchiveUrl() {
  if (IS_WIN) {
    return 'https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip';
  }
  if (IS_MAC) return 'https://evermeet.cx/ffmpeg/getrelease/zip';
  return 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz';
}

async function downloadTo(url, destPath) {
  console.log(`[fetch-binaries] downloading ${url}`);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url} (HTTP ${response.status})`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destPath));
}

/** Recursively finds a file by name inside dir. */
function findFileByName(dir, fileName) {
  const queue = [dir];
  while (queue.length > 0) {
    const current = queue.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(entryPath);
      else if (entry.name === fileName) return entryPath;
    }
  }
  return undefined;
}

async function ensureYtDlp() {
  const target = path.join(BIN_DIR, `yt-dlp${EXT}`);
  if (!FORCE && existsSync(target)) return;
  await downloadTo(ytdlpUrl(), target);
  if (!IS_WIN) chmodSync(target, 0o755);
}

async function ensureFfmpeg() {
  const needed = ['ffmpeg', ...(IS_MAC ? [] : ['ffprobe'])].map((n) => `${n}${EXT}`);
  if (!FORCE && needed.every((n) => existsSync(path.join(BIN_DIR, n)))) return;

  const tmpArchive = path.join(BIN_DIR, '_ffmpeg-archive.tmp');
  const extractDir = path.join(BIN_DIR, '_ffmpeg-extract');
  try {
    await downloadTo(ffmpegArchiveUrl(), tmpArchive);
    rmSync(extractDir, { recursive: true, force: true });
    mkdirSync(extractDir, { recursive: true });
    // bsdtar (bundled with Windows 10+) handles zip; GNU/BSD tar handles tar.xz.
    const result = spawnSync('tar', ['-xf', tmpArchive, '-C', extractDir], { stdio: 'ignore' });
    if (result.status !== 0 || statSync(tmpArchive).size === 0) {
      throw new Error(`Failed to extract ffmpeg archive (tar exit code ${result.status})`);
    }

    for (const name of needed) {
      const found = findFileByName(extractDir, name);
      if (!found) throw new Error(`Could not find ${name} inside the downloaded archive`);
      renameSync(found, path.join(BIN_DIR, name));
      if (!IS_WIN) chmodSync(path.join(BIN_DIR, name), 0o755);
    }
  } finally {
    rmSync(tmpArchive, { force: true });
    rmSync(extractDir, { recursive: true, force: true });
  }
}

async function main() {
  mkdirSync(BIN_DIR, { recursive: true });
  await ensureYtDlp();
  await ensureFfmpeg();
  console.log(`[fetch-binaries] Done. Binaries are in ${BIN_DIR}`);
}

main().catch((error) => {
  console.error('[fetch-binaries] FAILED:', error.message);
  process.exit(1);
});
