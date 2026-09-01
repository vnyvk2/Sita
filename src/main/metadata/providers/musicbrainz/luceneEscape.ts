/**
 * Escapes Lucene query-syntax special characters for safe use inside a quoted phrase of a
 * MusicBrainz search query.
 *
 * Titles/artists containing quotes, boolean operators, or punctuation such as `+ - && || ! ( ) { }
 * [ ] ^ " ~ * ? : \ /` would otherwise alter or corrupt the query syntax.
 */
const LUCENE_SPECIALS = /([+\-&|!(){}[\]^"~*?:\\/])/g;

export const escapeLuceneValue = (value: string): string => {
  if (!value) return value;
  return value.replace(LUCENE_SPECIALS, '\\$1');
};
