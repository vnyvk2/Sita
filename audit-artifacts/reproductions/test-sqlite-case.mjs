import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE albums (id INTEGER PRIMARY KEY, title TEXT, title_ci TEXT GENERATED ALWAYS AS (lower(title)));');
db.exec("INSERT INTO albums (title) VALUES ('Thriller');");

const r1 = db.prepare("SELECT * FROM albums WHERE title_ci = 'Thriller'").all();
const r2 = db.prepare("SELECT * FROM albums WHERE title_ci = 'thriller'").all();

console.log({ matchWithOriginalCase: r1.length, matchWithLower: r2.length });
