import type { CollectionId, CollectionSource, CollectionType } from './types';

/**
 * Parses a canonical collection URI into a structured CollectionId.
 * Expected format: source://type/key
 * Example: local://playlist/52
 */
export function parseCollectionUri(uri: string): CollectionId {
  const match = uri.match(/^([a-z]+):\/\/([a-zA-Z0-9_-]+)\/(.+)$/);
  
  if (!match) {
    throw new Error(`Invalid collection URI format: '${uri}'. Expected format: 'source://type/key'`);
  }

  const [, source, type, key] = match;

  // Coerce purely numeric keys back to numbers for domain types
  const parsedKey = /^\d+$/.test(key) ? parseInt(key, 10) : key;

  return {
    uri,
    source: source as CollectionSource,
    type: type as CollectionType,
    key: parsedKey
  };
}

/**
 * Builds a canonical collection URI from its components.
 * Format: source://type/key
 */
export function buildCollectionUri(
  source: CollectionSource,
  type: CollectionType,
  key: string | number
): string {
  return `${source}://${type}/${key}`;
}

/**
 * Creates a complete CollectionId object from its components,
 * automatically generating the canonical URI.
 */
export function createCollectionId(
  source: CollectionSource,
  type: CollectionType,
  key: string | number
): CollectionId {
  return {
    uri: buildCollectionUri(source, type, key),
    source,
    type,
    key
  };
}

export function getNumericKey(id: CollectionId): number | undefined {
  const parsed = typeof id.key === 'string' ? parseInt(id.key, 10) : id.key;
  return isNaN(parsed) ? undefined : parsed;
}
