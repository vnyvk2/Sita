import { describe, expect, it } from 'vitest';

import { MetadataFieldDefinition } from '@main/metadata/models/MetadataFieldDefinition';
import { MetadataFieldRegistry } from '@main/metadata/registries/MetadataFieldRegistry';

describe('MetadataFieldRegistry', () => {
  it('should initialize with default field definitions', () => {
    const registry = MetadataFieldRegistry.getInstance();
    expect(registry.has('title')).toBe(true);
    expect(registry.has('artist')).toBe(true);
    expect(registry.has('album')).toBe(true);
    expect(registry.has('genre')).toBe(true);
  });

  it('should allow registering custom plugin fields', () => {
    const registry = MetadataFieldRegistry.getInstance();
    const customField = new MetadataFieldDefinition({
      id: 'emotion',
      displayName: 'Emotion',
      valueType: 'string',
      searchable: true,
      filterable: true
    });

    registry.register(customField);
    expect(registry.has('emotion')).toBe(true);
    expect(registry.get('emotion')?.displayName).toBe('Emotion');

    registry.unregister('emotion');
    expect(registry.has('emotion')).toBe(false);
  });
});
