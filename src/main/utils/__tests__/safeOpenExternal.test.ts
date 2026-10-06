import { shell } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { safeOpenExternal } from '../safeOpenExternal';

vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('../../logger', () => ({
  default: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn()
  }
}));

describe('safeOpenExternal — URL scheme security invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows valid HTTPS URLs', async () => {
    const res = await safeOpenExternal('https://www.last.fm/api/auth');
    expect(res).toBe(true);
    expect(shell.openExternal).toHaveBeenCalledWith('https://www.last.fm/api/auth');
  });

  it('allows valid HTTP URLs', async () => {
    const res = await safeOpenExternal('http://example.com/test');
    expect(res).toBe(true);
    expect(shell.openExternal).toHaveBeenCalledWith('http://example.com/test');
  });

  it('allows valid mailto: URLs (report bug & support contacts)', async () => {
    const res = await safeOpenExternal('mailto:vny.vk2@gmail.com');
    expect(res).toBe(true);
    expect(shell.openExternal).toHaveBeenCalledWith('mailto:vny.vk2@gmail.com');
  });

  it('blocks file: URLs to prevent local file execution', async () => {
    const res = await safeOpenExternal('file:///C:/Windows/System32/calc.exe');
    expect(res).toBe(false);
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it('blocks dangerous Windows URI schemes (calc:, search-ms:, ms-msdt:)', async () => {
    for (const dangerousUrl of ['calc:', 'search-ms:query=test', 'ms-msdt:command']) {
      const res = await safeOpenExternal(dangerousUrl);
      expect(res).toBe(false);
      expect(shell.openExternal).not.toHaveBeenCalled();
    }
  });

  it('blocks javascript: and data: pseudo-protocols', async () => {
    for (const xssUrl of ['javascript:alert(1)', 'data:text/html,<b>x</b>']) {
      const res = await safeOpenExternal(xssUrl);
      expect(res).toBe(false);
      expect(shell.openExternal).not.toHaveBeenCalled();
    }
  });

  it('handles invalid strings and malformed inputs gracefully without throwing', async () => {
    // @ts-expect-error Testing invalid runtime types
    expect(await safeOpenExternal(null)).toBe(false);
    // @ts-expect-error Testing invalid runtime types
    expect(await safeOpenExternal(undefined)).toBe(false);
    expect(await safeOpenExternal('')).toBe(false);
    expect(await safeOpenExternal('not-a-valid-url')).toBe(false);
    expect(shell.openExternal).not.toHaveBeenCalled();
  });
});
