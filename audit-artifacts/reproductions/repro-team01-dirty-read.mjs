import { DatabaseSync } from 'node:sqlite';

// Demonstrates that direct engine.all() calls (e.g. in getFlatSongsByIds and dumpToSql)
// execute on the same connection as open transactions, reading uncommitted state
// that vanishes upon transaction rollback.

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE songs (id INTEGER PRIMARY KEY, title TEXT);
  INSERT INTO songs VALUES (1, 'Committed Song');
`);

console.log('[REPRO] Testing dirty read on single DatabaseSync connection...');
db.exec('BEGIN IMMEDIATE;');
db.exec("INSERT INTO songs VALUES (2, 'Uncommitted Ghost Track');");

// Concurrent read bypassing withTxLock (as occurs in songs.ts lines 350 & 473)
const visibleRows = db.prepare('SELECT * FROM songs').all();
console.log('[REPRO] Rows read by concurrent query during open transaction:', visibleRows);

db.exec('ROLLBACK;');
const postRollbackRows = db.prepare('SELECT * FROM songs').all();
console.log('[REPRO] Rows after transaction rollback:', postRollbackRows);

const dirtyRead = visibleRows.some((r) => r.id === 2);
if (dirtyRead) {
  console.log('[REPRO CONFIRMED] Dirty read occurred: uncommitted rolled-back data was exposed.');
}
