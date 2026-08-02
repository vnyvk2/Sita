import { describe, expect, it } from 'vitest';

import { MetadataBootstrap } from '@main/metadata/setup';
import { metadataFieldRegistry } from '@main/metadata/registries/MetadataFieldRegistry';

describe('MetadataBootstrap', () => {
  it('should initialize and reset metadata bootstrap container without error', () => {
    MetadataBootstrap.initialize();
    expect(metadataFieldRegistry.getAll().length).toBeGreaterThan(0);

    MetadataBootstrap.reset();
    MetadataBootstrap.initialize();
    expect(metadataFieldRegistry.getAll().length).toBeGreaterThan(0);
  });
});
