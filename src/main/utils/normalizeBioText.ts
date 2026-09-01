/** Comprehensive HTML Entity and Unicode Decoder Map. */
const HTML_ENTITIES: Record<string, string> = {
  '&quot;': '"',
  '&apos;': "'",
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
  '&iexcl;': '¡',
  '&cent;': '¢',
  '&pound;': '£',
  '&curren;': '¤',
  '&yen;': '¥',
  '&brvbar;': '¦',
  '&sect;': '§',
  '&uml;': '¨',
  '&copy;': '©',
  '&ordf;': 'ª',
  '&laquo;': '«',
  '&not;': '¬',
  '&shy;': '',
  '&reg;': '®',
  '&macr;': '¯',
  '&deg;': '°',
  '&plusmn;': '±',
  '&sup2;': '²',
  '&sup3;': '³',
  '&acute;': '´',
  '&micro;': 'µ',
  '&para;': '¶',
  '&middot;': '·',
  '&cedil;': '¸',
  '&sup1;': '¹',
  '&ordm;': 'º',
  '&raquo;': '»',
  '&frac14;': '¼',
  '&frac12;': '½',
  '&frac34;': '¾',
  '&iquest;': '¿',
  '&times;': '×',
  '&divide;': '÷',
  '&lsquo;': "'",
  '&rsquo;': "'",
  '&sbquo;': '‚',
  '&ldquo;': '"',
  '&rdquo;': '"',
  '&bdquo;': '„',
  '&dagger;': '†',
  '&Dagger;': '‡',
  '&permil;': '‰',
  '&lsaquo;': '‹',
  '&rsaquo;': '›',
  '&euro;': '€',
  '&hellip;': '...',
  '&mdash;': '—',
  '&ndash;': '–',
  '&bull;': '•',
  '&trade;': '™'
};

/** Decodes all HTML entities including named, decimal (&#123;), and hex (&#x1F;). */
export function decodeHtmlEntities(text: string): string {
  if (!text) return '';

  return (
    text
      // Hex entities: &#x1F600;
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
        try {
          const codePoint = parseInt(hex, 16);
          return String.fromCodePoint(codePoint);
        } catch {
          return '';
        }
      })
      // Decimal entities: &#8217;
      .replace(/&#(\d+);/g, (_, dec) => {
        try {
          const codePoint = parseInt(dec, 10);
          return String.fromCodePoint(codePoint);
        } catch {
          return '';
        }
      })
      // Named entities: &hellip;, &quot;, etc.
      .replace(/&[a-zA-Z]+;/g, (match) => HTML_ENTITIES[match] ?? match)
  );
}

/** Known placeholder / non-informative patterns from Last.fm / Wikipedia. */
const BIO_PLACEHOLDER_PATTERNS = [
  /does not have a biography/i,
  /we don'?t have a biography/i,
  /is a musical artist/i,
  /there are multiple artists/i,
  /there are at least \d+ artists/i,
  /incorrect tag for/i,
  /may refer to/i,
  /see disambiguation/i
];

export interface NormalizedBioResult {
  isValid: boolean;
  summary: string;
  fullText: string;
  paragraphs: string[];
  rejectionReason?: string;
}

export const BIO_QUALITY_MIN_LENGTH = 250;

/**
 * Robustly normalizes HTML and raw text biographies:
 *
 * 1. Strips `<a href="...">...</a>` anchor tags (which typically link to external wiki pages)
 * 2. Converts `<p>`, `<div>`, `<br>` to clean `\n\n` paragraph boundaries
 * 3. Strips remaining HTML tags
 * 4. Decodes all named and numeric HTML entities
 * 5. Collapses excessive internal whitespace per paragraph
 * 6. Applies a quality gate (length >= 250, not placeholder)
 */
export function normalizeBioText(
  rawInput?: string,
  minLength = BIO_QUALITY_MIN_LENGTH
): NormalizedBioResult {
  if (!rawInput || typeof rawInput !== 'string') {
    return {
      isValid: false,
      summary: '',
      fullText: '',
      paragraphs: [],
      rejectionReason: 'Empty or non-string input'
    };
  }

  // 1. Remove Last.fm anchor links (e.g. <a href="https://www.last.fm/music/...">Read more on Last.fm</a>)
  let text = rawInput.replace(/<a\b[^>]*>.*?<\/a>/gi, '');

  // 2. Convert block and break tags to double newlines
  text = text
    .replace(/<\/(p|div|section|article|header|h[1-6])>/gi, '\n\n')
    .replace(/<(p|div|section|article|header|h[1-6])[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n\n');

  // 3. Strip all other HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // 4. Decode HTML entities
  text = decodeHtmlEntities(text);

  // 5. Split by double or more newlines and clean each paragraph
  const rawParagraphs = text.split(/\n{2,}/);
  const paragraphs: string[] = [];

  for (const para of rawParagraphs) {
    const cleaned = para.replace(/\s+/g, ' ').trim();
    if (cleaned.length > 0) {
      paragraphs.push(cleaned);
    }
  }

  const fullText = paragraphs.join('\n\n');

  // 6. Quality Gate Evaluation
  if (fullText.length < minLength) {
    return {
      isValid: false,
      summary: paragraphs[0] ?? fullText,
      fullText,
      paragraphs,
      rejectionReason: `Bio length (${fullText.length}) is below threshold (${minLength})`
    };
  }

  for (const pattern of BIO_PLACEHOLDER_PATTERNS) {
    if (pattern.test(fullText)) {
      return {
        isValid: false,
        summary: paragraphs[0] ?? fullText,
        fullText,
        paragraphs,
        rejectionReason: `Matches placeholder pattern: ${pattern.toString()}`
      };
    }
  }

  // Generate summary: first paragraph, or truncated gracefully to sentence boundary if first paragraph is very long
  const firstPara = paragraphs[0] || '';
  let summary = firstPara;
  if (firstPara.length > 320) {
    const sentenceEnd = firstPara.indexOf('.', 200);
    if (sentenceEnd !== -1 && sentenceEnd < 400) {
      summary = firstPara.substring(0, sentenceEnd + 1);
    } else {
      summary = `${firstPara.substring(0, 300)}...`;
    }
  }

  return {
    isValid: true,
    summary,
    fullText,
    paragraphs
  };
}
