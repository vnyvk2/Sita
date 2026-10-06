import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { cleanupOldLogs } from '../logger';

describe('Logger rotation and retention cleanup (SEC-05)', () => {
  it('deletes log files older than maxAgeDays while keeping fresh files', () => {
    const tempUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'nora-logger-test-'));
    const logDir = path.join(tempUserData, 'logs');
    fs.mkdirSync(logDir, { recursive: true });

    const originalUserData = process.env.NORA_USER_DATA;
    process.env.NORA_USER_DATA = tempUserData;

    try {
      const freshLog = path.join(logDir, '2026-10-06.prod.log.txt');
      const staleLog = path.join(logDir, '2026-08-01.prod.log.txt');
      const nonLog = path.join(logDir, 'keep_me.txt');

      fs.writeFileSync(freshLog, 'fresh log content');
      fs.writeFileSync(staleLog, 'stale log content');
      fs.writeFileSync(nonLog, 'other text');

      // Age the stale log file to 20 days ago
      const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
      fs.utimesSync(staleLog, twentyDaysAgo, twentyDaysAgo);

      // Run cleanup with 14-day threshold
      cleanupOldLogs(14);

      expect(fs.existsSync(freshLog)).toBe(true);
      expect(fs.existsSync(staleLog)).toBe(false);
      expect(fs.existsSync(nonLog)).toBe(true);
    } finally {
      process.env.NORA_USER_DATA = originalUserData;
      fs.rmSync(tempUserData, { recursive: true, force: true });
    }
  });
});
