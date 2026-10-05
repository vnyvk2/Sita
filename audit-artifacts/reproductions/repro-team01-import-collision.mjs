import { DatabaseSync } from 'node:sqlite';

// Demonstrates that importDatabase (db.ts line 203) invokes engine.exec(sqlDump)
// without withTxLock, leading to SQLITE_ERROR crash when a transaction is in flight.

const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE test (id INT);');

console.log('[REPRO] Starting in-flight transaction...');
db.exec('BEGIN IMMEDIATE;');

try {
  // importDatabase executes a dump with its own BEGIN TRANSACTION
  console.log('[REPRO] Executing importDatabase sqlDump with BEGIN TRANSACTION...');
  db.exec(`
    PRAGMA foreign_keys=OFF;
    BEGIN TRANSACTION;
    DELETE FROM test;
    COMMIT;
  `);
} catch (err) {
  console.log('[REPRO CONFIRMED] SQLite collision error:', err.message);
}
