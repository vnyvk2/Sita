/**
 * REPRODUCTION SCRIPT: TEAM03-001 (CRITICAL)
 * Premature Generation Token Eviction in HydrationCoordinator
 *
 * Demonstrates:
 * 1. A query arrives with generationToken = 5 for list 'songs:default'.
 * 2. It executes and finishes. Since the queue is now empty, the coordinator's
 *    finally block deletes the generation token: `this.activeGenerations.delete(listIdentity)`.
 * 3. A delayed/stale lookahead request with generationToken = 2 arrives for the same list.
 * 4. Invariant Expectation: token 2 MUST be dropped as superseded (2 < 5).
 * 5. Reality: Since activeGenerations was deleted, getLatestGeneration() returns 0.
 *    Token 2 is accepted (2 > 0), executes, and resolves stale data, violating the
 *    monotonic generation token invariant!
 */

// Model based directly on src/main/core/hydrationCoordinator.ts
class HydrationCoordinatorModel {
  activeGenerations = new Map();
  pendingQueues = new Map();
  isExecuting = new Map();

  getLatestGeneration(listIdentity) {
    return this.activeGenerations.get(listIdentity) ?? 0;
  }

  updateGeneration(listIdentity, generationToken) {
    const current = this.activeGenerations.get(listIdentity) ?? 0;
    if (generationToken > current) {
      this.activeGenerations.set(listIdentity, generationToken);
      const queue = this.pendingQueues.get(listIdentity);
      if (queue && queue.length > 0) {
        for (let i = queue.length - 1; i >= 0; i--) {
          const task = queue[i];
          if (task.generationToken < generationToken) {
            queue.splice(i, 1);
            task.resolve({ cancelled: true, generationToken: task.generationToken });
          }
        }
      }
    }
  }

  schedule(options, execute) {
    const listIdentity = options.listIdentity ?? 'default';
    const generationToken = options.generationToken ?? 0;

    this.updateGeneration(listIdentity, generationToken);

    const latest = this.getLatestGeneration(listIdentity);
    if (generationToken < latest) {
      return Promise.resolve({ cancelled: true, generationToken });
    }

    return new Promise((resolve, reject) => {
      let queue = this.pendingQueues.get(listIdentity);
      if (!queue) {
        queue = [];
        this.pendingQueues.set(listIdentity, queue);
      }

      const task = {
        generationToken,
        listIdentity,
        execute,
        resolve,
        reject
      };

      queue.push(task);
      this.processQueue(listIdentity);
    });
  }

  async processQueue(listIdentity) {
    if (this.isExecuting.get(listIdentity)) return;
    this.isExecuting.set(listIdentity, true);

    try {
      while (true) {
        const queue = this.pendingQueues.get(listIdentity);
        if (!queue || queue.length === 0) break;

        const task = queue.shift();
        const latest = this.getLatestGeneration(listIdentity);
        if (task.generationToken < latest) {
          task.resolve({ cancelled: true, generationToken: task.generationToken });
          continue;
        }

        try {
          const result = await task.execute();
          const latestAfter = this.getLatestGeneration(listIdentity);
          if (task.generationToken < latestAfter) {
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
      // FLAW IN HYDRATION COORDINATOR (lines 151-155):
      // Deleting activeGenerations when queue becomes empty erases the highest token seen!
      const queue = this.pendingQueues.get(listIdentity);
      if (!queue || queue.length === 0) {
        this.pendingQueues.delete(listIdentity);
        this.activeGenerations.delete(listIdentity); // <--- DELETES TOKEN!
      }
    }
  }
}

async function run() {
  const coordinator = new HydrationCoordinatorModel();
  const listId = 'songs:default';

  console.log('--- Step 1: User scrolls, triggering Generation Token 5 ---');
  let task5Executed = false;
  const res5 = await coordinator.schedule(
    { listIdentity: listId, generationToken: 5 },
    async () => {
      task5Executed = true;
      return { data: 'Generation 5 Data (Fresh)' };
    }
  );
  console.log('Generation 5 Result:', res5);
  console.log(`Coordinator latest generation after queue drain: ${coordinator.getLatestGeneration(listId)}`);

  console.log('\n--- Step 2: Delayed/debounced lookahead arrives with Generation Token 2 (Obsolete) ---');
  let task2Executed = false;
  const res2 = await coordinator.schedule(
    { listIdentity: listId, generationToken: 2 },
    async () => {
      task2Executed = true;
      return { data: 'Generation 2 Data (Stale)' };
    }
  );

  console.log('Generation 2 Result:', res2);
  console.log(`Was Task 2 executed? ${task2Executed}`);

  if (res2.cancelled) {
    console.log('SUCCESS: Stale task 2 was correctly cancelled.');
  } else {
    console.log('\n[CRITICAL BUG CONFIRMED] Stale task 2 (token=2) was ACCEPTED and EXECUTED after task 5 (token=5)!');
    console.log(`Because activeGenerations was deleted on queue drain, getLatestGeneration() returned 0.`);
    console.log(`Stale data '${res2.data}' will overwrite fresh state in renderer!`);
  }
}

run().catch(console.error);
