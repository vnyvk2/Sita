import { version } from '../../../../package.json';
import logger from '../../logger';
import { HttpError } from './FetchHttpClient';
import { RequestPipeline } from './RequestPipeline';

export const WIKIPEDIA_REST_BASE_URL = 'https://en.wikipedia.org/api/rest_v1';
export const WIKIPEDIA_ACTION_BASE_URL = 'https://en.wikipedia.org/w/api.php';
const WIKIPEDIA_USER_AGENT = `NoraMusicPlayer/${version} (https://github.com/vnyvk2/MyNora)`;
const MAX_EXTRACT_LENGTH = 15000;

export interface WikipediaArtistProfile {
  title: string;
  description?: string;
  summary: string;
  fullExtract: string;
  originalImage?: string;
  thumbnail?: string;
  pageUrl: string;
}

/**
 * Unambiguous keywords for classifying a Wikipedia article as a musical artist/group. Precompiled
 * with word-boundary regexes to prevent accidental substring collisions.
 */
const MUSIC_KEYWORDS = [
  'singer',
  'songwriter',
  'musician',
  'band',
  'rapper',
  'dj',
  'duo',
  'trio',
  'composer',
  'vocalist',
  'guitarist',
  'drummer',
  'pianist',
  'bassist',
  'record producer',
  'music producer',
  'musical group',
  'music group',
  'orchestra',
  'discography',
  'record label',
  'recording artist',
  'studio album',
  'debut album',
  'debut single',
  'extended play'
];

const MUSIC_KEYWORD_REGEXES = MUSIC_KEYWORDS.map(
  (kw) => new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
);

export class WikipediaApiClient {
  private readonly pipeline: RequestPipeline;

  constructor(pipeline?: RequestPipeline) {
    this.pipeline = pipeline ?? new RequestPipeline();
  }

  /**
   * Checks whether a text snippet contains keywords indicating a musical artist or group using word
   * boundaries.
   */
  public isMusicRelated(text?: string): boolean {
    if (!text) return false;
    return MUSIC_KEYWORD_REGEXES.some((regex) => regex.test(text));
  }

  /**
   * Resolves the biography and artwork for an artist from Wikipedia, handling disambiguation,
   * fast-fail qualified lookups, and full article extracts.
   */
  public async getArtistBiography(
    artistName: string,
    signal?: AbortSignal
  ): Promise<WikipediaArtistProfile | null> {
    const trimmed = artistName.trim();
    if (!trimmed) return null;

    try {
      // 1. Direct REST summary lookup for exact artist name
      const directSummary = await this.fetchRestSummary(trimmed, signal);

      if (
        directSummary &&
        directSummary.type !== 'disambiguation' &&
        (this.isMusicRelated(directSummary.description) ||
          this.isMusicRelated(directSummary.extract))
      ) {
        const fullArticle = await this.fetchFullArticleExtract(directSummary.title, signal);
        return {
          title: directSummary.title,
          description: directSummary.description,
          summary: directSummary.extract,
          fullExtract: fullArticle?.extract || directSummary.extract,
          originalImage: directSummary.originalimage?.source || fullArticle?.originalImage,
          thumbnail: directSummary.thumbnail?.source || fullArticle?.thumbnail,
          pageUrl:
            directSummary.content_urls?.desktop?.page ||
            `https://en.wikipedia.org/wiki/${encodeURIComponent(directSummary.title.replace(/\s+/g, '_'))}`
        };
      }

      // 2. Disambiguation or non-music collision detected (e.g. "Bush", "America", "Genesis")
      // Fast parallel direct REST lookups for qualified titles
      const qualifiedCandidates = [
        `${trimmed} (musician)`,
        `${trimmed} (band)`,
        `${trimmed} (singer)`
      ];

      const qualifiedSummaries = await Promise.allSettled(
        qualifiedCandidates.map((cand) => this.fetchRestSummary(cand, signal))
      );

      for (const res of qualifiedSummaries) {
        if (res.status === 'fulfilled' && res.value) {
          const summary = res.value;
          if (
            summary.type !== 'disambiguation' &&
            (this.isMusicRelated(summary.description) || this.isMusicRelated(summary.extract))
          ) {
            const fullArticle = await this.fetchFullArticleExtract(summary.title, signal);
            return {
              title: summary.title,
              description: summary.description,
              summary: summary.extract,
              fullExtract: fullArticle?.extract || summary.extract,
              originalImage: summary.originalimage?.source || fullArticle?.originalImage,
              thumbnail: summary.thumbnail?.source || fullArticle?.thumbnail,
              pageUrl:
                summary.content_urls?.desktop?.page ||
                `https://en.wikipedia.org/wiki/${encodeURIComponent(summary.title.replace(/\s+/g, '_'))}`
            };
          }
        }
      }

      // 3. Fallback: Run ONE targeted MediaWiki search query
      const searchTitle = await this.searchForMusicArticle(
        `"${trimmed}" (musician OR band OR singer)`,
        signal
      );
      if (searchTitle) {
        const article = await this.fetchFullArticleExtract(searchTitle, signal);
        if (
          article &&
          (this.isMusicRelated(article.description) || this.isMusicRelated(article.extract))
        ) {
          return {
            title: article.title,
            description: article.description,
            summary: article.summary,
            fullExtract: article.extract,
            originalImage: article.originalImage,
            thumbnail: article.thumbnail,
            pageUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(article.title.replace(/\s+/g, '_'))}`
          };
        }
      }

      // Never return an unverified non-music collision entity
      return null;
    } catch (err) {
      logger.warn(`[WikipediaApiClient] Failed to resolve biography for: ${artistName}`, {
        error: err
      });
      return null;
    }
  }

  private async fetchRestSummary(title: string, signal?: AbortSignal): Promise<any | null> {
    const url = `${WIKIPEDIA_REST_BASE_URL}/page/summary/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
    try {
      const res = await this.pipeline.execute<any>({
        url,
        method: 'GET',
        headers: {
          'User-Agent': WIKIPEDIA_USER_AGENT
        },
        signal
      });
      return res.data;
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status === 404) {
          return null;
        }
        if (err.status === 429) {
          logger.warn(`[WikipediaApiClient] Rate limited (429) fetching summary for: ${title}`);
          return null;
        }
        if (err.status === 403) {
          logger.warn(`[WikipediaApiClient] Access forbidden (403) fetching summary for: ${title}`);
          return null;
        }
      }
      return null;
    }
  }

  private async searchForMusicArticle(
    searchQuery: string,
    signal?: AbortSignal
  ): Promise<string | null> {
    const url = WIKIPEDIA_ACTION_BASE_URL;
    try {
      const res = await this.pipeline.execute<any>({
        url,
        method: 'GET',
        headers: {
          'User-Agent': WIKIPEDIA_USER_AGENT
        },
        params: {
          action: 'query',
          list: 'search',
          srsearch: searchQuery,
          srlimit: 3,
          utf8: 1,
          format: 'json'
        },
        signal
      });

      const results = res.data?.query?.search ?? [];
      for (const item of results) {
        if (this.isMusicRelated(item.snippet) || this.isMusicRelated(item.title)) {
          return item.title;
        }
      }
      return null;
    } catch (err) {
      logger.warn(`[WikipediaApiClient] Search failed for query: ${searchQuery}`, { error: err });
      return null;
    }
  }

  private async fetchFullArticleExtract(
    title: string,
    signal?: AbortSignal
  ): Promise<{
    title: string;
    summary: string;
    extract: string;
    description?: string;
    originalImage?: string;
    thumbnail?: string;
  } | null> {
    const url = WIKIPEDIA_ACTION_BASE_URL;
    try {
      const res = await this.pipeline.execute<any>({
        url,
        method: 'GET',
        headers: {
          'User-Agent': WIKIPEDIA_USER_AGENT
        },
        params: {
          action: 'query',
          prop: 'extracts|pageimages|description',
          titles: title,
          exlimit: 1, // Fetch full article extract across body sections
          explaintext: 1, // Plain text with double newlines between paragraphs
          piprop: 'original|thumbnail',
          pithumbsize: 600,
          redirects: 1,
          format: 'json'
        },
        signal
      });

      const pages = res.data?.query?.pages ?? {};
      const pageId = Object.keys(pages)[0];
      if (!pageId || pageId === '-1') return null;

      const page = pages[pageId];
      let extract = (page.extract ?? '').trim();
      if (extract.length > MAX_EXTRACT_LENGTH) {
        const paragraphBoundary = extract.lastIndexOf('\n\n', MAX_EXTRACT_LENGTH);
        if (paragraphBoundary > MAX_EXTRACT_LENGTH * 0.7) {
          extract = extract.slice(0, paragraphBoundary);
        } else {
          const sentenceBoundary = extract.lastIndexOf('. ', MAX_EXTRACT_LENGTH);
          extract =
            sentenceBoundary > MAX_EXTRACT_LENGTH * 0.7
              ? extract.slice(0, sentenceBoundary + 1)
              : extract.slice(0, MAX_EXTRACT_LENGTH) + '...';
        }
      }
      const summary = extract.split(/\n{2,}/)[0] ?? extract;

      return {
        title: page.title,
        description: page.description,
        summary,
        extract,
        originalImage: page.original?.source,
        thumbnail: page.thumbnail?.source
      };
    } catch (err) {
      logger.warn(`[WikipediaApiClient] Failed to fetch full extract for: ${title}`, {
        error: err
      });
      return null;
    }
  }
}
