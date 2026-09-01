import { existsSync } from 'fs';
import path from 'path';

import { app } from 'electron';

export type BinaryName = 'yt-dlp' | 'ffmpeg' | 'ffprobe';

const EXT = process.platform === 'win32' ? '.exe' : '';

/**
 * Resolves the absolute path of an external binary used by the downloads feature.
 *
 * Resolution order:
 *
 * 1. `<userData>/bin/` — user-updated binaries. This override location lets the download engine be
 *    refreshed (e.g. a newer yt-dlp after a YouTube change) without reinstalling or releasing a new
 *    app version.
 * 2. Development: resources/bin relative to the app path.
 * 3. Packaged: inside the unpacked asar (a real file on disk, required for spawning), mirrored from
 *    `asarUnpack: resources/**` in electron-builder.yml.
 */
export function resolveBinaryPath(name: BinaryName): string {
  const fileName = `${name}${EXT}`;
  const candidates = [
    path.join(app.getPath('userData'), 'bin', fileName),
    ...(app.isPackaged
      ? [
          path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'bin', fileName),
          path.join(process.resourcesPath, 'resources', 'bin', fileName),
          path.join(process.resourcesPath, 'bin', fileName)
        ]
      : [path.join(app.getAppPath(), 'resources', 'bin', fileName)])
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    `Required binary "${fileName}" was not found. Run "npm run fetch:binaries" in development, ` +
      `or place it in ${path.join(app.getPath('userData'), 'bin')} to update the download engine.`
  );
}
