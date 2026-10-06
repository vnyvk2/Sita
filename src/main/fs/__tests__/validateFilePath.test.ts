import { describe, expect, it } from 'vitest';
import {
  isAllowedNoraFilePath,
  isPathInside,
  isSystemOrSensitivePath
} from '../validateFilePath';

describe('validateFilePath (SEC-01)', () => {
  describe('isSystemOrSensitivePath denylist', () => {
    it('blocks Windows system directories', () => {
      expect(isSystemOrSensitivePath('C:\\Windows\\win.ini')).toBe(true);
      expect(isSystemOrSensitivePath('C:\\windows\\system32\\drivers\\etc\\hosts')).toBe(true);
      expect(isSystemOrSensitivePath('C:\\Program Files\\App\\app.exe')).toBe(true);
      expect(isSystemOrSensitivePath('C:\\Program Files (x86)\\App\\app.exe')).toBe(true);
      expect(isSystemOrSensitivePath('C:\\ProgramData\\Package Cache\\setup.exe')).toBe(true);
    });

    it('blocks POSIX system directories', () => {
      expect(isSystemOrSensitivePath('/etc/passwd')).toBe(true);
      expect(isSystemOrSensitivePath('/etc/shadow')).toBe(true);
      expect(isSystemOrSensitivePath('/sys/kernel')).toBe(true);
      expect(isSystemOrSensitivePath('/proc/1/cmdline')).toBe(true);
      expect(isSystemOrSensitivePath('/bin/sh')).toBe(true);
      expect(isSystemOrSensitivePath('/usr/bin/env')).toBe(true);
    });

    it('blocks credential and dotfile directories', () => {
      expect(isSystemOrSensitivePath('C:\\Users\\User\\.ssh\\id_rsa')).toBe(true);
      expect(isSystemOrSensitivePath('/home/user/.ssh/authorized_keys')).toBe(true);
      expect(isSystemOrSensitivePath('C:\\Users\\User\\.aws\\credentials')).toBe(true);
      expect(isSystemOrSensitivePath('D:\\music\\.git\\config')).toBe(true);
      expect(isSystemOrSensitivePath('D:\\music\\.env')).toBe(true);
    });

    it('allows benign non-system paths', () => {
      expect(isSystemOrSensitivePath('D:\\Music\\Track01.mp3')).toBe(false);
      expect(isSystemOrSensitivePath('C:\\Users\\User\\Music\\song.flac')).toBe(false);
    });
  });

  describe('isPathInside', () => {
    it('accurately checks directory boundaries without prefix collisions', () => {
      expect(isPathInside('D:\\Music\\Track.mp3', 'D:\\Music')).toBe(true);
      expect(isPathInside('D:\\Music\\Sub\\Track.mp3', 'D:\\Music')).toBe(true);
      expect(isPathInside('D:\\MusicFolderEvil\\Track.mp3', 'D:\\Music')).toBe(false);
    });
  });

  describe('isAllowedNoraFilePath', () => {
    it('blocks invalid inputs', async () => {
      expect(await isAllowedNoraFilePath('')).toBe(false);
      expect(await isAllowedNoraFilePath(null as unknown as string)).toBe(false);
    });

    it('blocks Windows win.ini and hosts files', async () => {
      expect(await isAllowedNoraFilePath('C:/Windows/win.ini')).toBe(false);
      expect(await isAllowedNoraFilePath('C:\\Windows\\System32\\drivers\\etc\\hosts')).toBe(false);
    });
  });
});
