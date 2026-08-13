import type { db } from '@main/db/db';

declare global {
  type DB = typeof db;
  type DBTransaction = Parameters<Parameters<DB['transaction']>[0]>[0];
}
