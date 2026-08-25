import { describe, expect, it } from 'vitest';

import { escapeLuceneValue } from '../luceneEscape';

describe('MusicBrainz — Lucene value escaping', () => {
  it('escapes embedded double quotes', () => {
    expect(escapeLuceneValue('The "Best" Album')).toBe('The \\"Best\\" Album');
  });

  it('neutralizes boolean-operator injection', () => {
    const escaped = escapeLuceneValue('Hold On) OR artist:"Someone Else');
    // Syntax characters are escaped so injection cannot alter query structure;
    // remaining bare 'OR' sits safely inside the quoted phrase.
    expect(escaped).toBe('Hold On\\) OR artist\\:\\"Someone Else');
  });

  it('escapes backslashes without producing invalid sequences', () => {
    expect(escapeLuceneValue('AC\\DC')).toBe('AC\\\\DC');
  });

  it('escapes all Lucene special characters', () => {
    expect(escapeLuceneValue('+-&|!(){}[]^"~*?:/')).toBe(
      '\\+\\-\\&\\|\\!\\(\\)\\{\\}\\[\\]\\^\\"\\~\\*\\?\\:\\/'
    );
  });

  it('leaves plain and unicode titles untouched', () => {
    expect(escapeLuceneValue('Abbey Road')).toBe('Abbey Road');
    expect(escapeLuceneValue('夜に駆ける')).toBe('夜に駆ける');
    expect(escapeLuceneValue('')).toBe('');
  });
});
