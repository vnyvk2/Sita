import { normalizeBioText, decodeHtmlEntities } from '@main/utils/normalizeBioText';
import { describe, expect, it } from 'vitest';

describe('normalizeBioText', () => {
  it('decodes named, decimal, and hex HTML entities', () => {
    expect(decodeHtmlEntities('&quot;Hello&quot; &amp; &#039;World&#039; &hellip;')).toBe(
      '"Hello" & \'World\' ...'
    );
    expect(decodeHtmlEntities('Gracie&#x27;s debut track &mdash; &lsquo;Mean It&rsquo;')).toBe(
      "Gracie's debut track — 'Mean It'"
    );
    expect(decodeHtmlEntities('&copy; 2024 &bull; All Rights Reserved')).toBe(
      '© 2024 • All Rights Reserved'
    );
  });

  it('strips Last.fm HTML links, converts paragraph tags, and preserves paragraph breaks', () => {
    const rawBio = `
      <p>Gracie Abrams (born September 7, 1999) is an American singer-songwriter from Los Angeles, California.</p>
      <p>After having only three tracks publicly available on her Soundcloud (&lsquo;And She Will Miss You&rsquo;, &lsquo;blue&rsquo;), Gracie released her first debut track &lsquo;Mean It&rsquo; along with an accompanying music video.<br><br>In 2024 Abrams commenced her sophomore album era with &lsquo;Risk&rsquo;.</p>
      <a href="https://www.last.fm/music/Gracie+Abrams">Read more on Last.fm</a>
    `;

    const normalized = normalizeBioText(rawBio, 100);
    expect(normalized.isValid).toBe(true);
    expect(normalized.paragraphs).toHaveLength(3);
    expect(normalized.fullText).not.toContain('<a');
    expect(normalized.fullText).not.toContain('Read more on Last.fm');
    expect(normalized.fullText).toContain('Gracie Abrams (born September 7, 1999)');
    expect(normalized.fullText).toContain("'Mean It'");
  });

  it('enforces quality gate on short or placeholder biographies', () => {
    const placeholderBio = 'Gracie Abrams does not have a biography on Last.fm.';
    const result = normalizeBioText(placeholderBio, 250);
    expect(result.isValid).toBe(false);

    const genericShort = 'Short sentence.';
    const shortResult = normalizeBioText(genericShort, 250);
    expect(shortResult.isValid).toBe(false);
  });
});
