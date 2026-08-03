import { describe, expect, it, vi } from 'vitest';

vi.mock('@db/db', () => ({
  db: {
    query: {
      songs: { findFirst: vi.fn(), findMany: vi.fn() },
      artists: { findFirst: vi.fn(), findMany: vi.fn() },
      albums: { findFirst: vi.fn(), findMany: vi.fn() },
      genres: { findFirst: vi.fn(), findMany: vi.fn() },
      playlists: { findFirst: vi.fn(), findMany: vi.fn() }
    }
  }
}));

import { MetadataBootstrap } from '@main/metadata/setup';

describe('MetadataBootstrap', () => {
  it('should bootstrap metadata module container with provider executor and diagnostics tracker', () => {
    const container = MetadataBootstrap.bootstrap();
    expect(container.engine).toBeDefined();
    expect(container.repository).toBeDefined();
    expect(container.localProvider).toBeDefined();
    expect(container.executor).toBeDefined();
    expect(container.diagnosticsTracker).toBeDefined();
    expect(container.providerMergePolicy).toBeDefined();
    expect(container.planner).toBeDefined();
    expect(container.pipeline).toBeDefined();
    expect(container.mapperRegistry).toBeDefined();
    expect(container.fieldRegistry).toBeDefined();
    expect(container.cache).toBeDefined();
    expect(container.eventBus).toBeDefined();
  });
});
