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
 * Matches and ranks settings catalog entries against a user search query.
 *
 * Scoring Hierarchy:
 * - 100: Exact title match
 * - 90:  Title prefix match
 * - 80:  Title word-boundary match
 * - 70:  Title substring match
 * - 60:  Alias exact match
 * - 50:  Alias prefix match
 * - 40:  Alias substring match
 * - 30:  Description substring match
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

  const results: SettingSearchResult[] = [];

  for (const entry of catalog) {
    // 1. Resolve localized title
    const translatedTitle = t(entry.titleKey, { defaultValue: entry.defaultTitle });
    const title = typeof translatedTitle === 'string' && translatedTitle.length > 0
      ? translatedTitle
      : entry.defaultTitle;
    const normTitle = normalizeText(title);

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
    let highlightQuery = rawQuery;

    // Check Title Match
    if (normTitle === normQuery) {
      bestScore = 100;
      matchedField = 'title';
    } else if (normTitle.startsWith(normQuery)) {
      bestScore = 90;
      matchedField = 'title';
    } else {
      const titleWords = normTitle.split(/\s+/);
      if (titleWords.some((word) => word.startsWith(normQuery))) {
        bestScore = 80;
        matchedField = 'title';
      } else if (normTitle.includes(normQuery)) {
        bestScore = 70;
        matchedField = 'title';
      }
    }

    // Check Alias Match (if title didn't score higher than 80)
    if (bestScore < 80) {
      for (const alias of allAliases) {
        const normAlias = normalizeText(alias);
        if (normAlias === normQuery) {
          if (bestScore < 60) {
            bestScore = 60;
            matchedField = 'alias';
            matchedAlias = alias;
            highlightQuery = rawQuery;
          }
          break;
        } else if (normAlias.startsWith(normQuery)) {
          if (bestScore < 50) {
            bestScore = 50;
            matchedField = 'alias';
            matchedAlias = alias;
            highlightQuery = rawQuery;
          }
        } else if (normAlias.includes(normQuery)) {
          if (bestScore < 40) {
            bestScore = 40;
            matchedField = 'alias';
            matchedAlias = alias;
            highlightQuery = rawQuery;
          }
        }
      }
    }

    // Check Description Match (if no higher score)
    if (bestScore < 40 && normDesc.length > 0 && normDesc.includes(normQuery)) {
      bestScore = 30;
      matchedField = 'description';
      highlightQuery = rawQuery;
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
