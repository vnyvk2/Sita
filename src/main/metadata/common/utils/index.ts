import type { MetadataKind } from '../../models/MetadataKind';

/**
 * Normalizes string values by removing punctuation and converting to lowercase.
 */
export function normalizeMetadataString(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Generates a deterministic identity key for a given entity kind and entity ID.
 */
export function generateMetadataIdentityKey(
  entityKind: MetadataKind,
  entityId: string | number
): string {
  return `${entityKind}:${entityId}`;
}
