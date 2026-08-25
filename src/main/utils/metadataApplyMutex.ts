/**
 * Process-wide single-flight mutex for metadata APPLY operations.
 *
 * Invariant: only ONE AutoTag / workflow apply may mutate physical files and
 * library state at any moment, across BOTH pipelines (they share this
 * instance).
 *
 * Policy: a concurrent caller is REJECTED immediately with
 * {@link MetadataApplyBusyError} rather than queued - queued stale previews
 * applying later surprises users; explicit rejection lets the UI say "an
 * apply is already running".
 */
export class MetadataApplyBusyError extends Error {
  constructor() {
    super('Another metadata apply operation is already running');
    this.name = 'MetadataApplyBusyError';
  }
}

class SingleFlightMutex {
  private lockedToken: symbol | null = null;

  public tryAcquire(): symbol | null {
    if (this.lockedToken !== null) return null;
    const token = Symbol('metadata-apply-lock');
    this.lockedToken = token;
    return token;
  }

  public release(token: symbol): void {
    if (this.lockedToken === token) {
      this.lockedToken = null;
    }
  }

  public get isLocked(): boolean {
    return this.lockedToken !== null;
  }
}

const mutex = new SingleFlightMutex();

export async function runExclusiveMetadataApply<T>(fn: () => Promise<T>): Promise<T> {
  const token = mutex.tryAcquire();
  if (token === null) {
    throw new MetadataApplyBusyError();
  }

  try {
    return await fn();
  } finally {
    // The mutex must free even when the apply fails or is cancelled -
    // otherwise one aborted operation would lock out all future applies.
    mutex.release(token);
  }
}

/** Test/diagnostics visibility only. */
export const isMetadataApplyLocked = (): boolean => mutex.isLocked;
