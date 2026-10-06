import path from 'path';
import { pathToFileURL } from 'url';
import { describe, expect, it } from 'vitest';
import { isAllowedAppNavigation } from '../safeNavigation';

describe('isAllowedAppNavigation (SEC-08)', () => {
  it('rejects external HTTP/HTTPS websites', () => {
    expect(isAllowedAppNavigation('https://evil.com')).toBe(false);
    expect(isAllowedAppNavigation('http://malicious.org/phish')).toBe(false);
  });

  it('rejects javascript:, data:, and file protocol outside app directory', () => {
    expect(isAllowedAppNavigation('javascript:alert(1)')).toBe(false);
    expect(isAllowedAppNavigation('data:text/html,<h1>hacked</h1>')).toBe(false);
    expect(isAllowedAppNavigation('file:///C:/Windows/System32/cmd.exe')).toBe(false);
    expect(isAllowedAppNavigation('file:///etc/passwd')).toBe(false);
  });

  it('rejects adversarial substring matching on external rogue paths', () => {
    expect(isAllowedAppNavigation('file:///C:/evil/out/renderer/malware.html')).toBe(false);
    expect(isAllowedAppNavigation('file:///C:/other_folder/src/renderer/index.html')).toBe(false);
  });

  it('rejects invalid or empty URLs', () => {
    expect(isAllowedAppNavigation('')).toBe(false);
    expect(isAllowedAppNavigation('not-a-url')).toBe(false);
  });

  it('accepts file URLs strictly inside the app bundle directory', () => {
    const validUrl1 = pathToFileURL(path.join(process.cwd(), 'out', 'renderer', 'index.html')).href;
    const validUrl2 = pathToFileURL(path.join(process.cwd(), 'out', 'renderer', 'floatingLyrics.html')).href;
    expect(isAllowedAppNavigation(validUrl1)).toBe(true);
    expect(isAllowedAppNavigation(validUrl2)).toBe(true);
  });
});
