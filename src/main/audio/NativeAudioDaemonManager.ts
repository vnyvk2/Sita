import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

import { app } from 'electron';

import type {
  DaemonCommand,
  DaemonPushEvent,
  DaemonRequest,
  DaemonResponse,
  SoundProfile
} from '../../common/audioEngineProtocol';
import { removeDefaultAppProtocolFromFilePath } from '../fs/resolveFilePaths';
import logger from '../logger';

export function resolveToLocalDiskPath(inputPath: string): string {
  let cleanPath = inputPath;
  if (cleanPath.startsWith('nora://') || cleanPath.startsWith('nora:/')) {
    cleanPath = removeDefaultAppProtocolFromFilePath(cleanPath);
  } else if (cleanPath.startsWith('file://')) {
    cleanPath = fileURLToPath(cleanPath);
  }
  const queryIndex = cleanPath.indexOf('?');
  if (queryIndex !== -1) {
    cleanPath = cleanPath.substring(0, queryIndex);
  }
  try {
    cleanPath = decodeURIComponent(cleanPath);
  } catch {
    // Already decoded
  }
  if (process.platform === 'win32') {
    cleanPath = cleanPath.replaceAll('/', '\\');
  }
  return cleanPath;
}

/**
 * T3-1: pure identity formatter for daemon launch diagnostics. Correlates the spawned file with the
 * handshake so a stale binary (e.g. pre-sound_profile) is a 30-second diagnosis instead of a
 * mystery timeout. No I/O here; the caller supplies an optional mtime.
 */
export interface DaemonIdentityLog {
  binaryPath: string | null;
  engineVersion: string | null;
  bootId: number | null;
  protocolVersion: number | null;
  /** Binary mtime (dev/diagnostic only); absent in packaged builds. */
  binaryMtimeMs?: number;
}

export function formatDaemonIdentity(
  binaryPath: string | null,
  event: Extract<DaemonPushEvent, { event: 'ready' }> | null,
  binaryMtimeMs?: number
): DaemonIdentityLog {
  const identity: DaemonIdentityLog = {
    binaryPath,
    engineVersion: event?.engine_version ?? null,
    bootId: event?.boot_id ?? null,
    protocolVersion: event?.protocol_version ?? null
  };
  if (typeof binaryMtimeMs === 'number') {
    identity.binaryMtimeMs = binaryMtimeMs;
  }
  return identity;
}

export class NativeAudioDaemonManager {
  private child: ChildProcess | null = null;
  private isIntentionalStop = false;
  private isStarting = false;
  private nextRequestId = 1;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;

  private pendingRequests = new Map<
    number,
    {
      resolve: (res: DaemonResponse) => void;
      reject: (err: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();

  /** Binary selected by the most recent spawn; used to correlate the ready handshake with its file. */
  private lastBinaryPath: string | null = null;

  private listeners = new Set<(event: DaemonPushEvent) => void>();
  private crashTimestamps: number[] = [];
  private exceededCrashLimit = false;
  private userSoundProfile: SoundProfile = 'studio_reference';
  private startPromise: Promise<void> | null = null;

  public setSoundProfilePreference(profile: SoundProfile): void {
    this.userSoundProfile = profile;
  }

  public getSoundProfilePreference(): SoundProfile {
    return this.userSoundProfile;
  }

  public findBinaryPath(): string | null {
    const binaryName = process.platform === 'win32' ? 'engine-cli.exe' : 'engine-cli';

    const candidates = app?.isPackaged
      ? [
          path.join(process.resourcesPath, 'bin', binaryName),
          path.join(process.cwd(), 'resources', 'bin', binaryName)
        ]
      : [
          app?.getAppPath ? path.join(app.getAppPath(), 'target', 'release', binaryName) : null,
          path.join(process.cwd(), 'target', 'release', binaryName),
          app?.getAppPath ? path.join(app.getAppPath(), 'target', 'debug', binaryName) : null,
          path.join(process.cwd(), 'target', 'debug', binaryName),
          path.join(process.cwd(), 'resources', 'bin', binaryName)
        ];

    const existing = candidates
      .filter((p): p is string => Boolean(p))
      .filter((p) => fs.existsSync(p));

    if (existing.length === 0) {
      return null;
    }

    if (app?.isPackaged) {
      return existing[0];
    }

    // In dev mode, pick the freshest binary by mtime so tests/builds aren't trapped on stale binaries
    return existing.sort((a, b) => {
      try {
        return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
      } catch {
        return 0;
      }
    })[0];
  }

  public isAvailable(): boolean {
    return !this.exceededCrashLimit && this.findBinaryPath() !== null;
  }

  public isRunning(): boolean {
    return this.child !== null && !this.child.killed;
  }

  public addListener(listener: (event: DaemonPushEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(event: DaemonPushEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        logger.error('Error in NativeAudioDaemon listener:', { err });
      }
    }
  }

  public async start(): Promise<void> {
    if (this.child && !this.child.killed && !this.isStarting) {
      return;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.executeStartSequence();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async executeStartSequence(): Promise<void> {
    if (this.exceededCrashLimit) {
      throw new Error(
        'Native audio engine has exceeded maximum restart attempts (3 crashes within 10 seconds).'
      );
    }

    const binaryPath = this.findBinaryPath();
    if (!binaryPath) {
      throw new Error('Native audio engine executable (engine-cli) not found on disk.');
    }

    this.isStarting = true;
    this.isIntentionalStop = false;

    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;

      const readyTimeout = setTimeout(() => {
        if (this.isStarting) {
          // Orphan guard: a daemon that never handshakes must not linger
          // holding the WASAPI endpoint while start() stays wedged.
          try {
            this.child?.kill('SIGKILL');
          } catch {
            // ignore kill errors; exit handler cleans up state
          }
          reject(new Error('Native audio engine failed to emit ready handshake within 5000ms.'));
        }
      }, 5000);

      const previousResolve = this.readyResolve;
      this.readyResolve = () => {
        clearTimeout(readyTimeout);
        this.isStarting = false;
        previousResolve();
      };
    });

    try {
      logger.info('Spawning native audio daemon:', { binaryPath });
      this.lastBinaryPath = binaryPath;
      const child = spawn(binaryPath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: {
          ...process.env,
          RUST_LOG: process.env.RUST_LOG ?? 'info'
        }
      });

      this.child = child;

      if (!child.stdout || !child.stdin || !child.stderr) {
        throw new Error('Failed to acquire stdio pipes for native audio daemon child process.');
      }

      const stdoutRl = readline.createInterface({ input: child.stdout });
      stdoutRl.on('line', (line) => this.handleStdoutLine(line));

      const stderrRl = readline.createInterface({ input: child.stderr });
      stderrRl.on('line', (line) => {
        if (line.trim().length > 0) {
          logger.warn('[NativeAudioEngine stderr]', { output: line.trim() });
        }
      });

      child.on('error', (err) => {
        logger.error('Native audio daemon process error:', { err });
        this.handleProcessExit(1, 'spawn_error');
      });

      child.on('exit', (code, signal) => {
        logger.info('Native audio daemon process exited:', { code, signal });
        this.handleProcessExit(code ?? 0, signal ?? 'exit');
      });

      await this.readyPromise;

      // Restore user's sound profile preference before returning so subsequent audio commands
      // execute with the restored profile already in effect.
      try {
        await this.sendCommandInternal({
          cmd: 'set_sound_profile',
          profile: this.userSoundProfile
        });
        logger.info('Restored user sound profile preference on daemon startup:', {
          profile: this.userSoundProfile
        });
      } catch (profileErr) {
        logger.error('Failed to restore user sound profile on daemon startup:', { profileErr });
      }
    } catch (err) {
      this.isStarting = false;
      this.child = null;
      throw err;
    }
  }

  private handleStdoutLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;

      // Check if this line is an asynchronous push event
      if (typeof parsed.event === 'string') {
        const event = parsed as unknown as DaemonPushEvent;
        if (event.event === 'ready') {
          logger.info('Native audio daemon ready handshake received:', event);
          // T3-1: single identity line per boot — file vs handshake version
          // correlation. mtime is dev/diagnostic only, never in packaged builds.
          let binaryMtimeMs: number | undefined;
          if (app?.isPackaged !== true && this.lastBinaryPath) {
            try {
              binaryMtimeMs = fs.statSync(this.lastBinaryPath).mtimeMs;
            } catch {
              // Binary vanished between spawn and handshake; path alone suffices.
            }
          }
          logger.info(
            'Native audio daemon identity:',
            formatDaemonIdentity(this.lastBinaryPath, event, binaryMtimeMs)
          );
          if (this.readyResolve) {
            this.readyResolve();
            this.readyResolve = null;
          }
        }
        this.notifyListeners(event);
        return;
      }

      // Check if this line is a correlated command response
      if (typeof parsed.id === 'number') {
        const id = parsed.id;
        const pending = this.pendingRequests.get(id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(id);
          pending.resolve(parsed as unknown as DaemonResponse);
        } else {
          // u64::MAX malformed errors + late responses after 5s timeout land
          // here; log instead of silently dropping for protocol debugging.
          logger.warn('Native audio daemon response with unknown id:', { id, trimmed });
        }
      }
    } catch (err) {
      logger.error('Failed to parse stdout line from native audio daemon:', { trimmed, err });
    }
  }

  private handleProcessExit(code: number, reason: string): void {
    this.child = null;
    this.isStarting = false;

    // Fail all pending correlated requests
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      pending.reject(
        new Error(
          `Native audio daemon process terminated before responding to request ${id} (code: ${code}, reason: ${reason}).`
        )
      );
    }
    this.pendingRequests.clear();

    if (this.isIntentionalStop) {
      return;
    }

    // Supervision logic: check rolling 10-second crash window
    const now = Date.now();
    this.crashTimestamps = this.crashTimestamps.filter((t) => now - t < 10000);
    this.crashTimestamps.push(now);

    if (this.crashTimestamps.length >= 3) {
      this.exceededCrashLimit = true;
      logger.error(
        'Native audio daemon exceeded 3 crashes within 10 seconds. Disabling daemon supervision.'
      );
      this.notifyListeners({
        event: 'device_error',
        message: 'Native audio daemon crashed repeatedly (3x in 10s). Reverting to WebAudio.'
      });
      return;
    }

    logger.warn('Native audio daemon crashed unexpectedly; restarting after backoff...', {
      crashCount: this.crashTimestamps.length
    });

    const backoffMs = Math.min(1000, 200 * Math.pow(2, this.crashTimestamps.length - 1));
    setTimeout(() => {
      if (!this.isIntentionalStop && !this.exceededCrashLimit) {
        this.start().catch((err) => {
          logger.error('Failed to auto-restart native audio daemon:', { err });
        });
      }
    }, backoffMs);
  }

  public async sendCommand(command: DaemonCommand): Promise<DaemonResponse> {
    if (command.cmd === 'set_sound_profile') {
      this.userSoundProfile = command.profile;
    }

    if (this.startPromise) {
      await this.startPromise;
    } else if (!this.isRunning()) {
      await this.start();
    }

    return this.sendCommandInternal(command);
  }

  private sendCommandInternal(command: DaemonCommand): Promise<DaemonResponse> {
    if (!this.child || !this.child.stdin || this.child.killed) {
      throw new Error('Native audio daemon child process is not running or stdin is closed.');
    }

    // Translate audio path to local disk path if needed
    let translatedCommand = command;
    if (command.cmd === 'load' || command.cmd === 'preload') {
      const diskPath = resolveToLocalDiskPath(command.path);
      if (!fs.existsSync(diskPath)) {
        logger.error('File not found on disk for native audio command:', {
          cmd: command.cmd,
          diskPath,
          originalPath: command.path
        });
        return Promise.resolve({
          id: this.nextRequestId++,
          status: 'error',
          message: `File not found on disk: ${diskPath}`
        });
      }
      translatedCommand = {
        ...command,
        path: diskPath
      };
    }

    const id = this.nextRequestId++;
    const request: DaemonRequest = {
      id,
      ...translatedCommand
    };

    return new Promise<DaemonResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(
          new Error(
            `Native audio daemon timed out waiting for response to command ${command.cmd} (id: ${id}, 5000ms).`
          )
        );
      }, 5000);

      this.pendingRequests.set(id, { resolve, reject, timer });

      try {
        const payload = JSON.stringify(request) + '\n';
        this.child!.stdin!.write(payload, 'utf8', (err) => {
          if (err) {
            clearTimeout(timer);
            this.pendingRequests.delete(id);
            reject(err);
          }
        });
      } catch (writeErr) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(writeErr as Error);
      }
    });
  }

  public async stop(): Promise<void> {
    this.isIntentionalStop = true;
    if (!this.child || this.child.killed) {
      this.child = null;
      return;
    }

    const currentChild = this.child;
    this.child = null;

    return new Promise<void>((resolve) => {
      let resolved = false;
      const finish = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      const killTimeout = setTimeout(() => {
        try {
          if (!currentChild.killed) {
            logger.warn('Native audio daemon did not exit within 500ms; force terminating');
            currentChild.kill('SIGKILL');
          }
        } catch {
          // ignore
        }
        finish();
      }, 500);

      currentChild.once('exit', () => {
        clearTimeout(killTimeout);
        finish();
      });

      try {
        currentChild.stdin?.end();
        if (process.platform === 'win32') {
          // Immediately send SIGTERM on Windows to release the WASAPI audio endpoint
          currentChild.kill('SIGTERM');
        }
      } catch {
        currentChild.kill('SIGKILL');
        finish();
      }
    });
  }
}

export const nativeAudioDaemonManager = new NativeAudioDaemonManager();
