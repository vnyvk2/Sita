import parseLyrics from '@common/parseLyrics';
import { describe, expect, it } from 'vitest';

// Parity baseline: these assertions were recorded against the ORIGINAL
// implementation (pinyin-pro / @neos21/detect-chinese / kuroshiro) before the
// Unicode-range heuristic replacement. The refactor must keep them identical.
const sample = (text: string) => `[ti:t]\n[ar:a]\n${text}`;

describe('parseLyrics originalLanguage detection parity baseline', () => {
  it('detects pure Chinese lyrics as zh', () => {
    const out = parseLyrics(sample('明月几时有\n把酒问青天\n不知天上宫阙\n今夕是何年'));
    expect(out.originalLanguage).toBe('zh');
  });

  it('detects Japanese lyrics with kana and kanji as ja', () => {
    const out = parseLyrics(sample('夜に駆ける\n沈むように溶けてゆくように\n二人だけの空が広がる夜に'));
    expect(out.originalLanguage).toBe('ja');
  });

  it('detects Korean lyrics as ko', () => {
    const out = parseLyrics(sample('나의 두 눈에 감춰왔던 모든 말들\n모아서 그대에게 보여주고 싶어'));
    expect(out.originalLanguage).toBe('ko');
  });

  it('leaves English lyrics undetected (no zh/ja/ko label)', () => {
    const out = parseLyrics(sample('Yesterday all my troubles seemed so far away\nNow it looks as though they are here to stay'));
    expect(out.originalLanguage).toBeUndefined();
  });
});
