import { EventEmitter } from 'events';

import logger from '../logger';

export interface ChangeEntry {
  path: string;
  source: 'folder-watcher' | 'parent-watcher';
}

export interface LibraryChangeState {
  isDirty: boolean;
  changedPaths: string[];
  lastChangedAt: number | null;
}

export class LibraryChangeTracker extends EventEmitter {
  private static instance: LibraryChangeTracker;
  private isDirty = false;
  private changedPaths = new Set<string>();
  private lastChangedAt: number | null = null;

  public static getInstance(): LibraryChangeTracker {
    if (!this.instance) {
      this.instance = new LibraryChangeTracker();
    }
    return this.instance;
  }

  public markDirty(entry?: ChangeEntry): void {
    this.isDirty = true;
    if (entry?.path) {
      this.changedPaths.add(entry.path);
    }
    this.lastChangedAt = Date.now();

    logger.debug(
      `[LibraryChangeTracker] Marked dirty${entry ? ` from ${entry.source}: '${entry.path}'` : ''}`
    );

    const state = this.getState();
    this.emit('changed', { state, entry: entry ?? null });
  }

  public getState(): LibraryChangeState {
    return {
      isDirty: this.isDirty,
      changedPaths: Array.from(this.changedPaths),
      lastChangedAt: this.lastChangedAt
    };
  }

  public reset(): void {
    this.isDirty = false;
    this.changedPaths.clear();
    this.lastChangedAt = null;

    logger.debug('[LibraryChangeTracker] Reset dirty state to clean.');
    const state = this.getState();
    this.emit('changed', { state, entry: null });
  }
}

export default LibraryChangeTracker.getInstance();
