import { describe, expect, it, vi } from 'vitest';

import { MetadataIdentity } from '@main/metadata/models/MetadataIdentity';
import { UserMetadataProvider } from '@main/metadata/providers/UserMetadataProvider';
import type { UserMetadataRepository } from '@main/metadata/repository/UserMetadataRepository';

describe('UserMetadataProvider', () => {
  it('should fetch overrides from repository and return ProviderResult with Priority 1000', async () => {
    const mockRepository: Partial<UserMetadataRepository> = {
      getOverrides: vi.fn().mockResolvedValue([
        { entityKind: 'song', entityId: '201', fieldId: 'title', value: 'User Overridden Title' },
        { entityKind: 'song', entityId: '201', fieldId: 'language', value: 'Tamil' }
      ]),
      getOverridesForMany: vi.fn()
    };

    const provider = new UserMetadataProvider(mockRepository as UserMetadataRepository);
    expect(provider.info.priority).toBe(1000);

    const identity = new MetadataIdentity({ entityKind: 'song', entityId: 201 });
    const result = await provider.fetch(identity);

    expect(result.status).toBe('success');
    expect(result.payload).toEqual({
      title: 'User Overridden Title',
      language: 'Tamil'
    });
  });
});
