import { describe, expect, it } from 'vitest';

import { MetadataBootstrap } from '@main/metadata/setup';

describe('MetadataBootstrap', () => {
  it('should bootstrap metadata module container with default registries', () => {
    const metadataModule = MetadataBootstrap.bootstrap();
    expect(metadataModule.fieldRegistry).toBeDefined();
    expect(metadataModule.providerRegistry).toBeDefined();
    expect(metadataModule.fieldRegistry.getAll().length).toBeGreaterThan(0);
  });
});
