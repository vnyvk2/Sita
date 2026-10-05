/**
 * REPRODUCTION: TEAM09-001
 * Title: SmartPlaylistCompiler generates case-sensitive eq/neq predicates in SQLite, failing to match metadata
 *
 * Demonstrates that when SmartPlaylistCompiler generates an `eq` or `neq` predicate for string metadata
 * (e.g. `genre eq "rock"` or `artist eq "the beatles"`), it outputs `${col} = ${value}`.
 *
 * Because SQLite text columns have default `BINARY` collation (case-sensitive) and `eq` lacks `lower()`
 * or `COLLATE NOCASE`, queries fail to match capitalized metadata ('Rock', 'The Beatles') stored in the database.
 * Meanwhile, `contains` DOES use `lower(${col})`, creating inconsistent matching behavior.
 */

import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';

console.log('=== Running Reproduction TEAM09-001 ===');

const db = new DatabaseSync(':memory:');

// Setup schema mirroring Nora SQLite schema
db.exec(`
  CREATE TABLE genres (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
  );

  CREATE TABLE artists (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
  );

  CREATE TABLE songs (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL
  );
`);

// Insert test records with standard real-world capitalization
db.exec(`
  INSERT INTO genres (name) VALUES ('Electronic'), ('Rock'), ('Hip Hop');
  INSERT INTO artists (name) VALUES ('Daft Punk'), ('The Beatles');
  INSERT INTO songs (title) VALUES ('Get Lucky'), ('Yesterday');
`);

// Simulate SmartPlaylistCompiler.compileCondition for 'eq'
// From SmartPlaylistCompiler.ts:66-67:
// case 'eq': return sql`${col} = ${value}`;
function compileEq(col, value) {
  return { sql: `${col} = ?`, params: [value] };
}

// Simulate SmartPlaylistCompiler.compileCondition for 'contains'
// From SmartPlaylistCompiler.ts:79-80:
// case 'contains': return sql`lower(${col}) LIKE ${'%' + escaped + '%'} ESCAPE '\\'`;
function compileContains(col, value) {
  return { sql: `lower(${col}) LIKE ? ESCAPE '\\'`, params: [`%${value.toLowerCase()}%`] };
}

// Test Case 1: User creates Smart Playlist for genre == "electronic" (lowercase input)
const eqCondition = compileEq('name', 'electronic');
const stmtEq = db.prepare(`SELECT * FROM genres WHERE ${eqCondition.sql}`);
const eqResults = stmtEq.all(...eqCondition.params);

console.log('Query: SELECT * FROM genres WHERE name = ? [electronic]');
console.log('Result count:', eqResults.length);

// In SQLite, BINARY collation causes this to return 0 results!
assert.strictEqual(
  eqResults.length,
  0,
  'Defect: eq comparison failed to match "Electronic" against "electronic" due to SQLite default BINARY collation'
);

// Test Case 2: User uses 'contains' with the exact same input
const containsCondition = compileContains('name', 'electronic');
const stmtContains = db.prepare(`SELECT * FROM genres WHERE ${containsCondition.sql}`);
const containsResults = stmtContains.all(...containsCondition.params);

console.log("Query: SELECT * FROM genres WHERE lower(name) LIKE '%electronic%'");
console.log('Result count:', containsResults.length);
assert.strictEqual(
  containsResults.length,
  1,
  'contains matched correctly because it lowercases the column'
);

// Test Case 3: Verify the fix (COLLATE NOCASE or lower() equality)
const fixedStmt = db.prepare('SELECT * FROM genres WHERE name = ? COLLATE NOCASE');
const fixedResults = fixedStmt.all('electronic');
assert.strictEqual(fixedResults.length, 1, 'COLLATE NOCASE successfully matches');

console.log('\nConfirmed: SmartPlaylistCompiler `eq` predicate fails case-insensitively in SQLite.');
console.log('`contains` succeeds while `eq` silently returns 0 matching tracks.');
console.log('=== Reproduction TEAM09-001 Verified Successfully ===');
