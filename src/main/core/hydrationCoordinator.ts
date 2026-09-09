import logger from '../logger';

export interface WindowHydrationOptions {
  generationToken?: number;
  priority?: 'target' | 'lookahead';
  listIdentity?: string;
  compact?: boolean;
}

export interface CancelledHydrationResponse {
  cancelled: true;
  generationToken?: number;
}

interface QueuedHydrationTask {
  generationToken: number;
  priority: 'target' | 'lookahead';
  listIdentity: string;
  execute: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

export class HydrationCoordinator {
  private activeGenerations = new Map<string, number>();
  private pendingQueues = new Map<string, QueuedHydrationTask[]>();
  private isExecuting = new Map<string, boolean>();

  public getLatestGeneration(listIdentity: string): number {
    return this.activeGenerations.get(listIdentity) ?? 0;
  }

  public updateGeneration(listIdentity: string, generationToken: number): void {
    const current = this.activeGenerations.get(listIdentity) ?? 0;
    if (generationToken > current) {
      this.activeGenerations.set(listIdentity, generationToken);
      // Evict any existing pending tasks in the queue that have a lower generationToken
      const queue = this.pendingQueues.get(listIdentity);
      if (queue && queue.length > 0) {
        for (let i = queue.length - 1; i >= 0; i--) {
          const task = queue[i];
          if (task.generationToken < generationToken) {
            queue.splice(i, 1);
            logger.debug(
              `[Coordinator] Evicting pending task token=${task.generationToken} superseded by ${generationToken} (list=${listIdentity})`
            );
            task.resolve({ cancelled: true, generationToken: task.generationToken });
          }
        }
      }
    }
  }

  public schedule<T>(
    options: WindowHydrationOptions,
    execute: () => Promise<T>
  ): Promise<T | CancelledHydrationResponse> {
    const listIdentity = options.listIdentity ?? 'default';
    const generationToken = options.generationToken ?? 0;
    const priority = options.priority ?? 'target';

    this.updateGeneration(listIdentity, generationToken);

    // Fast check: if this task is already superseded by a newer token, resolve immediately
    const latest = this.getLatestGeneration(listIdentity);
    if (generationToken < latest) {
      logger.debug(
        `[Coordinator] Dropping task token=${generationToken} immediately (latest=${latest}, list=${listIdentity})`
      );
      return Promise.resolve({ cancelled: true, generationToken });
    }

    return new Promise<T | CancelledHydrationResponse>((resolve, reject) => {
      let queue = this.pendingQueues.get(listIdentity);
      if (!queue) {
        queue = [];
        this.pendingQueues.set(listIdentity, queue);
      }

      const task: QueuedHydrationTask = {
        generationToken,
        priority,
        listIdentity,
        execute,
        resolve: resolve as (value: unknown) => void,
        reject
      };

      if (priority === 'target') {
        // Target tasks take precedence over lookahead tasks
        const firstLookaheadIdx = queue.findIndex((t) => t.priority === 'lookahead');
        if (firstLookaheadIdx !== -1) {
          queue.splice(firstLookaheadIdx, 0, task);
        } else {
          queue.push(task);
        }
      } else {
        queue.push(task);
      }

      this.processQueue(listIdentity);
    });
  }

  private async processQueue(listIdentity: string): Promise<void> {
    if (this.isExecuting.get(listIdentity)) {
      return;
    }

    this.isExecuting.set(listIdentity, true);

    try {
      while (true) {
        const queue = this.pendingQueues.get(listIdentity);
        if (!queue || queue.length === 0) {
          break;
        }

        const task = queue.shift()!;
        const latest = this.getLatestGeneration(listIdentity);

        // Check if task became superseded while waiting in queue
        if (task.generationToken < latest) {
          logger.debug(
            `[Coordinator] Skipping execution for superseded task token=${task.generationToken} (latest=${latest}, list=${listIdentity})`
          );
          task.resolve({ cancelled: true, generationToken: task.generationToken });
          continue;
        }

        try {
          const result = await task.execute();
          // After execution completes, check if a newer generation arrived during SQL execution
          const latestAfter = this.getLatestGeneration(listIdentity);
          if (task.generationToken < latestAfter) {
            logger.debug(
              `[Coordinator] Dropping task results after execution token=${task.generationToken} (latest=${latestAfter}, list=${listIdentity})`
            );
            task.resolve({ cancelled: true, generationToken: task.generationToken });
          } else {
            task.resolve(result);
          }
        } catch (err) {
          task.reject(err);
        }
      }
    } finally {
      this.isExecuting.delete(listIdentity);
      // Prune empty map entries to prevent slow memory leak from accumulated listIdentity keys
      // (e.g. each search keystroke creates a unique identity that would persist forever).
      const queue = this.pendingQueues.get(listIdentity);
      if (!queue || queue.length === 0) {
        this.pendingQueues.delete(listIdentity);
        this.activeGenerations.delete(listIdentity);
      }
    }
  }

  public reset(listIdentity?: string): void {
    if (listIdentity) {
      const queue = this.pendingQueues.get(listIdentity);
      if (queue) {
        for (const task of queue) {
          task.resolve({ cancelled: true, generationToken: task.generationToken });
        }
        queue.length = 0;
      }
      this.activeGenerations.delete(listIdentity);
      this.isExecuting.delete(listIdentity);
    } else {
      for (const queue of this.pendingQueues.values()) {
        for (const task of queue) {
          task.resolve({ cancelled: true, generationToken: task.generationToken });
        }
      }
      this.pendingQueues.clear();
      this.activeGenerations.clear();
      this.isExecuting.clear();
    }
  }
}

export const hydrationCoordinator = new HydrationCoordinator();
