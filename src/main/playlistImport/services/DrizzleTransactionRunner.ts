import type { TransactionRunner } from '../interfaces/TransactionRunner';

export class DrizzleTransactionRunner implements TransactionRunner {
  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return await work();
  }
}
