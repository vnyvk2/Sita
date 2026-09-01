import logger, { logFilePath } from '@main/logger';
import { describe, expect, it } from 'vitest';

describe('logger terminal output filtering', () => {
  it('should export logger and logFilePath', () => {
    expect(logger).toBeDefined();
    expect(logFilePath).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });
});
