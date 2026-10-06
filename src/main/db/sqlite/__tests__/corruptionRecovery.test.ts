import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openSqliteEngine, type SqliteEngine } from '../engine';

describe('SQLite Database Corruption Recovery (DAT-01 Gate)', () => {
  let tempDir: string;
  let corruptDbPath: string;
  let engine: SqliteEngine | null = null;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nora-corrupt-test-'));
    corruptDbPath = path.join(tempDir, 'nora.sqlite.db');
  });

  afterEach(async () => {
    if (engine) {
      await engine.close();
      engine = null;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects corrupted database file, backs it up to .corrupt.<ts>, and creates clean working schema without throwing', async () => {
    // 1. Write garbage bytes into the database file
    fs.writeFileSync(corruptDbPath, Buffer.from('CORRUPTED RANDOM GARBAGE DATA THAT IS NOT SQLITE HEADER 000000000000'));

    // 2. Open engine — should NOT crash/throw, should recover automatically
    engine = openSqliteEngine(corruptDbPath);

    expect(engine).toBeDefined();
    expect(engine.kind).toBe('sqlite');

    // 3. Verify backup file exists
    const files = fs.readdirSync(tempDir);
    const backupFile = files.find((f) => f.startsWith('nora.sqlite.db.corrupt.'));
    expect(backupFile).toBeDefined();

    // Verify backup file contains original garbage
    const backupContent = fs.readFileSync(path.join(tempDir, backupFile!), 'utf8');
    expect(backupContent).toContain('CORRUPTED RANDOM GARBAGE DATA');

    // 4. Verify new database is healthy and queryable
    const userVersion = engine.raw.prepare('PRAGMA user_version').get() as { user_version: number };
    expect(userVersion.user_version).toBeGreaterThanOrEqual(1);

    const tables = engine.raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    expect(tables.length).toBeGreaterThan(0);
  });

  it('recovers cleanly to a fallback database path when corrupt file remains locked on disk', async () => {
    // 1. Write garbage bytes into the database file
    fs.writeFileSync(corruptDbPath, Buffer.from('CORRUPT LOCKED DATA'));

    // 2. Mock renameSync to fail (simulating EBUSY) and mock rmSync to fail
    const originalRename = fs.renameSync;
    const originalRm = fs.rmSync;
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation((oldPath, newPath) => {
      if (typeof oldPath === 'string' && oldPath.includes('nora.sqlite.db')) {
        const err = new Error('EBUSY: resource busy or locked');
        (err as unknown as { code: string }).code = 'EBUSY';
        throw err;
      }
      return originalRename(oldPath, newPath);
    });

    const rmSpy = vi.spyOn(fs, 'rmSync').mockImplementation((targetPath, options) => {
      if (typeof targetPath === 'string' && targetPath.endsWith('nora.sqlite.db')) {
        const err = new Error('EBUSY: resource busy or locked');
        (err as unknown as { code: string }).code = 'EBUSY';
        throw err;
      }
      return originalRm(targetPath, options);
    });

    try {
      engine = openSqliteEngine(corruptDbPath);

      expect(engine).toBeDefined();
      expect(engine.kind).toBe('sqlite');

      // Verify the fallback database was created and initialized
      const files = fs.readdirSync(tempDir);
      const fallbackFile = files.find((f) => f.includes('.recovered.'));
      expect(fallbackFile).toBeDefined();

      const userVersion = engine.raw.prepare('PRAGMA user_version').get() as { user_version: number };
      expect(userVersion.user_version).toBeGreaterThanOrEqual(1);
    } finally {
      renameSpy.mockRestore();
      rmSpy.mockRestore();
    }
  });
});
