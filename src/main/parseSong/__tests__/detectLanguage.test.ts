import { describe, expect, it } from 'vitest';

import {
  detectLanguageFromScript,
  detectSongLanguage,
  extractLanguageFromPath,
  extractLanguageFromTag,
  normalizeLanguageName
} from '../detectLanguage';

describe('detectLanguage', () => {
  describe('normalizeLanguageName', () => {
    it('normalizes 2-letter and 3-letter ISO codes', () => {
      expect(normalizeLanguageName('tel')).toBe('Telugu');
      expect(normalizeLanguageName('te')).toBe('Telugu');
      expect(normalizeLanguageName('hin')).toBe('Hindi');
      expect(normalizeLanguageName('hi')).toBe('Hindi');
      expect(normalizeLanguageName('tam')).toBe('Tamil');
      expect(normalizeLanguageName('ta')).toBe('Tamil');
      expect(normalizeLanguageName('kan')).toBe('Kannada');
      expect(normalizeLanguageName('eng')).toBe('English');
      expect(normalizeLanguageName('en')).toBe('English');
      expect(normalizeLanguageName('jpn')).toBe('Japanese');
      expect(normalizeLanguageName('ja')).toBe('Japanese');
      expect(normalizeLanguageName('kor')).toBe('Korean');
      expect(normalizeLanguageName('ko')).toBe('Korean');
      expect(normalizeLanguageName('spa')).toBe('Spanish');
    });

    it('preserves known capitalized language names', () => {
      expect(normalizeLanguageName('Telugu')).toBe('Telugu');
      expect(normalizeLanguageName('hindi')).toBe('Hindi');
      expect(normalizeLanguageName('TAMIL')).toBe('Tamil');
    });
  });

  describe('extractLanguageFromTag', () => {
    it('extracts language from tag.languages array', () => {
      const mockTag = { languages: ['tel'] } as any;
      expect(extractLanguageFromTag(mockTag)).toBe('Telugu');
    });

    it('extracts language from tag.language string', () => {
      const mockTag = { language: 'Hindi' } as any;
      expect(extractLanguageFromTag(mockTag)).toBe('Hindi');
    });

    it('returns undefined if no language in tag', () => {
      const mockTag = { title: 'Some Song' } as any;
      expect(extractLanguageFromTag(mockTag)).toBeUndefined();
      expect(extractLanguageFromTag(null)).toBeUndefined();
    });
  });

  describe('extractLanguageFromPath', () => {
    it('extracts language from folder name segments', () => {
      expect(extractLanguageFromPath('D:\\Music\\Telugu\\01 - Song.mp3')).toBe('Telugu');
      expect(extractLanguageFromPath('C:/Users/Music/Hindi Songs/track.flac')).toBe('Hindi');
      expect(extractLanguageFromPath('/media/drive/Tamil_Hits/Album/song.m4a')).toBe('Tamil');
      expect(extractLanguageFromPath('E:\\Songs\\Japanese-OST\\track.mp3')).toBe('Japanese');
      expect(extractLanguageFromPath('D:\\Music\\English Pop\\hit.mp3')).toBe('English');
    });

    it('returns undefined when path contains no known language folders', () => {
      expect(extractLanguageFromPath('D:\\Music\\Rock\\Track01.mp3')).toBeUndefined();
      expect(extractLanguageFromPath('/home/user/downloads/audio.mp3')).toBeUndefined();
    });
  });

  describe('detectLanguageFromScript', () => {
    it('detects Telugu script', () => {
      expect(detectLanguageFromScript('సామజవరగమన', ['సిద్ శ్రీరామ్'])).toBe('Telugu');
      expect(detectLanguageFromScript('ButtaBomma (బుట్టబొమ్మ)')).toBe('Telugu');
    });

    it('detects Tamil script', () => {
      expect(detectLanguageFromScript('வாத்தி கமிங்', ['அனிருத்'])).toBe('Tamil');
    });

    it('detects Hindi (Devanagari) script', () => {
      expect(detectLanguageFromScript('तुम ही हो', ['अरिजीत सिंह'])).toBe('Hindi');
      expect(detectLanguageFromScript('Kesariya (केसरिया)')).toBe('Hindi');
    });

    it('detects Korean (Hangul) script', () => {
      expect(detectLanguageFromScript('강남스타일', ['싸이'])).toBe('Korean');
    });

    it('detects Japanese (Kana) script', () => {
      expect(detectLanguageFromScript('ひまわりの約束', ['秦基博'])).toBe('Japanese');
      expect(detectLanguageFromScript('アイネクライネ')).toBe('Japanese');
    });

    it('returns undefined for plain Latin text', () => {
      expect(detectLanguageFromScript('Shape of You', ['Ed Sheeran'])).toBeUndefined();
      expect(detectLanguageFromScript('Samajavaragamana', ['Sid Sriram'])).toBeUndefined();
    });
  });

  describe('detectSongLanguage - Priority Cascade', () => {
    it('Priority 1: Embedded tag takes precedence over folder path', () => {
      const mockTag = { languages: ['tam'] } as any; // Tamil in tag
      const filePath = 'D:\\Music\\Telugu\\Track.mp3'; // Telugu in path
      expect(detectSongLanguage(mockTag, filePath, 'Song Title', [])).toBe('Tamil');
    });

    it('Priority 2: Folder path takes precedence over Unicode script', () => {
      const mockTag = null;
      const filePath = 'D:\\Music\\Hindi\\Track.mp3'; // Hindi in path
      const songTitle = 'సామజవరగమన'; // Telugu in script
      expect(detectSongLanguage(mockTag, filePath, songTitle, [])).toBe('Hindi');
    });

    it('Priority 3: Unicode script is used if no tag and no path language', () => {
      const mockTag = null;
      const filePath = 'D:\\Music\\Various\\Track.mp3';
      const songTitle = 'సామజవరగమన';
      expect(detectSongLanguage(mockTag, filePath, songTitle, [])).toBe('Telugu');
    });

    it('Priority 4: Returns undefined (Unspecified) for plain Latin songs without folder or tags', () => {
      const mockTag = null;
      const filePath = 'D:\\Music\\Various\\Track01.mp3';
      const songTitle = 'Random Latin Song Title';
      expect(detectSongLanguage(mockTag, filePath, songTitle, ['Artist Name'])).toBeUndefined();
    });
  });
});
