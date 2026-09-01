/**
 * Characters stripped by the *_norm search columns: ASCII whitespace + punctuation. Mirrors pg's
 * regexp_replace(col, '[[:punct:]]', '', 'g') + space removal. Shared by schema.ts (drizzle
 * generated-column expressions) and sqlite/ddl.ts (baseline DDL) so both produce identical
 * expressions by construction.
 */
export const NORM_STRIP_CHARS = ' !"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';
