import type { SettingCatalogEntry } from '../settingsCatalog';

export interface SettingSearchResult {
  entry: SettingCatalogEntry;
  score: number;
  title: string;
  description?: string;
  matchedField: 'title' | 'alias' | 'description';
  matchedAlias?: string;
  highlightQuery: string;
}

/**
 * Normalizes string by stripping diacritics/accents, lowercasing, and trimming whitespace.
 * e.g., "Français" -> "francais", "Café" -> "cafe"
 */
export const normalizeText = (text: string): string => {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
};

/**
 * Normalizes punctuation and separators to spaces for flexible tokenization.
 * e.g., "last.fm" -> "last fm", "mini-player" -> "mini player"
 */
export const normalizePunctuation = (text: string): string => {
  return text.replace(/[.\-_/\\,;:!?'"()[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();
};

/**
 * Matches and ranks settings catalog entries against a user search query.
 *
 * Scoring Hierarchy:
 * - 100: Exact title match
 * - 90:  Title prefix match
 * - 85:  Title multi-word all-token match
 * - 80:  Title word-boundary prefix match
 * - 70:  Title substring match (requires query.length >= 2)
 * - 60:  Alias exact match
 * - 55:  Alias multi-token match
 * - 50:  Alias prefix match
 * - 40:  Alias substring match (requires query.length >= 2)
 * - 30:  Description match (all tokens or substring, requires query.length >= 2)
 */
export const matchSettings = (
  query: string,
  catalog: SettingCatalogEntry[],
  t: (key: string, options?: Record<string, unknown>) => unknown
): SettingSearchResult[] => {
  const rawQuery = query.trim();
  const normQuery = normalizeText(rawQuery);

  if (normQuery.length === 0) {
    return [];
  }

  const cleanQuery = normalizePunctuation(normQuery);
  const queryTokens = cleanQuery.split(/\s+/).filter(Boolean);
  const isSingleChar = normQuery.length === 1;

  const results: SettingSearchResult[] = [];

  for (const entry of catalog) {
    // 1. Resolve localized title
    const translatedTitle = t(entry.titleKey, { defaultValue: entry.defaultTitle });
    const title =
      typeof translatedTitle === 'string' && translatedTitle.length > 0
        ? translatedTitle
        : entry.defaultTitle;
    const normTitle = normalizeText(title);
    const cleanTitle = normalizePunctuation(normTitle);
    const titleWords = cleanTitle.split(/\s+/).filter(Boolean);

    // 2. Resolve localized description if present
    let description: string | undefined = undefined;
    if (entry.descriptionKey || entry.defaultDescription) {
      const translatedDesc = entry.descriptionKey
        ? t(entry.descriptionKey, { defaultValue: entry.defaultDescription ?? '' })
        : entry.defaultDescription;
      if (typeof translatedDesc === 'string' && translatedDesc.length > 0) {
        description = translatedDesc;
      }
    }
    const normDesc = description ? normalizeText(description) : '';
    const cleanDesc = description ? normalizePunctuation(normDesc) : '';

    // 3. Resolve aliases: universal catalog keywords + per-locale aliases from i18n
    const localeAliasesRaw = t(`settingsPage.searchAliases.${entry.id}`, {
      returnObjects: true,
      defaultValue: []
    });
    const localeAliases: string[] = Array.isArray(localeAliasesRaw) ? localeAliasesRaw : [];
    const allAliases = [...entry.keywords, ...localeAliases];

    let bestScore = 0;
    let matchedField: 'title' | 'alias' | 'description' = 'title';
    let matchedAlias: string | undefined = undefined;
    const highlightQuery = rawQuery;

    // Check Title Exact and Prefix Match
    if (normTitle === normQuery || cleanTitle === cleanQuery) {
      bestScore = 100;
      matchedField = 'title';
    } else if (normTitle.startsWith(normQuery) || cleanTitle.startsWith(cleanQuery)) {
      bestScore = 90;
      matchedField = 'title';
    } else if (titleWords.some((word) => word.startsWith(normQuery))) {
      bestScore = 80;
      matchedField = 'title';
    } else if (
      queryTokens.length > 1 &&
      queryTokens.every((token) => titleWords.some((w) => w.startsWith(token) || w.includes(token)))
    ) {
      // Multi-word query where all tokens match title words (e.g. "theme mode")
      bestScore = 85;
      matchedField = 'title';
    } else if (!isSingleChar && (normTitle.includes(normQuery) || cleanTitle.includes(cleanQuery))) {
      bestScore = 70;
      matchedField = 'title';
    }

    // Check Alias Match (if title didn't score higher than 80)
    if (bestScore < 80) {
      for (const alias of allAliases) {
        const normAlias = normalizeText(alias);
        const cleanAlias = normalizePunctuation(normAlias);

        if (normAlias === normQuery || cleanAlias === cleanQuery) {
          if (bestScore < 60) {
            bestScore = 60;
            matchedField = 'alias';
            matchedAlias = alias;
          }
          break;
        } else if (normAlias.startsWith(normQuery) || cleanAlias.startsWith(cleanQuery)) {
          if (bestScore < 50) {
            bestScore = 50;
            matchedField = 'alias';
            matchedAlias = alias;
          }
        } else if (!isSingleChar && (normAlias.includes(normQuery) || cleanAlias.includes(cleanQuery))) {
          if (bestScore < 40) {
            bestScore = 40;
            matchedField = 'alias';
            matchedAlias = alias;
          }
        } else if (
          queryTokens.length > 1 &&
          queryTokens.every((token) => cleanAlias.includes(token))
        ) {
          if (bestScore < 55) {
            bestScore = 55;
            matchedField = 'alias';
            matchedAlias = alias;
          }
        }
      }
    }

    // Check Multi-word token match across Title + Aliases (e.g. "battery animation")
    if (queryTokens.length > 1) {
      const matchingAlias = allAliases.find((alias) =>
        queryTokens.every((token) => normalizePunctuation(normalizeText(alias)).includes(token))
      );
      if (matchingAlias && bestScore < 55) {
        bestScore = 55;
        matchedField = 'alias';
        matchedAlias = matchingAlias;
      } else if (bestScore < 45) {
        const combinedScope = `${cleanTitle} ${allAliases.map(normalizePunctuation).join(' ')}`;
        if (queryTokens.every((token) => combinedScope.includes(token))) {
          bestScore = 45;
          matchedField = 'alias';
          matchedAlias =
            allAliases.find((a) =>
              queryTokens.some((t) => normalizeText(a).includes(t))
            ) ?? allAliases[0];
        }
      }
    }

    // Check Description Match (disallow 1-char query noise)
    if (bestScore < 40 && !isSingleChar && cleanDesc.length > 0) {
      if (normDesc.includes(normQuery) || cleanDesc.includes(cleanQuery)) {
        bestScore = 30;
        matchedField = 'description';
      } else if (
        queryTokens.length > 1 &&
        queryTokens.every((token) => cleanDesc.includes(token))
      ) {
        bestScore = 30;
        matchedField = 'description';
      }
    }

    if (bestScore > 0) {
      results.push({
        entry,
        score: bestScore,
        title,
        description,
        matchedField,
        matchedAlias,
        highlightQuery
      });
    }
  }

  // Sort descending by score, tie-break ascending by title length and alphabetical
  return results.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (a.title.length !== b.title.length) {
      return a.title.length - b.title.length;
    }
    return a.title.localeCompare(b.title);
  });
};
