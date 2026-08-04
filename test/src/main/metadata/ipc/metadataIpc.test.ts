import { describe, expect, it, beforeEach, vi } from 'vitest';

const handlersMap = new Map<string, Function>();

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/userData', isPackaged: false },
  ipcMain: {
    handle: (channel: string, handler: Function) => {
      handlersMap.set(channel, handler);
    }
  }
}));

import { registerMetadataIPCHandlers } from '@main/metadata/ipc/metadataIpc';
import type { MetadataIdentity } from '@main/metadata/models/MetadataIdentity';
import { MetadataKinds } from '@main/metadata/models/MetadataKind';

describe('metadataIpc', () => {
  let mockEngine: any;
  let mockUserService: any;

  beforeEach(() => {
    handlersMap.clear();
    mockEngine = {
      load: vi.fn()
    };
    mockUserService = {
      setField: vi.fn().mockResolvedValue(undefined),
      setOverrides: vi.fn().mockResolvedValue(undefined),
      removeOverride: vi.fn().mockResolvedValue(undefined),
      clearOverrides: vi.fn().mockResolvedValue(undefined)
    };
  });

  it('should register all namespaced metadata IPC channels with injected dependencies', () => {
    registerMetadataIPCHandlers(mockEngine, mockUserService);

    expect(handlersMap.has('metadata.load')).toBe(true);
    expect(handlersMap.has('metadata.override.set')).toBe(true);
    expect(handlersMap.has('metadata.override.setBatch')).toBe(true);
    expect(handlersMap.has('metadata.override.remove')).toBe(true);
    expect(handlersMap.has('metadata.override.clear')).toBe(true);
  });

  it('should handle metadata.override.setBatch and metadata.load IPC calls with MetadataSnapshotSerializer DTOs', async () => {
    registerMetadataIPCHandlers(mockEngine, mockUserService);

    const setBatchHandler = handlersMap.get('metadata.override.setBatch')!;
    const loadHandler = handlersMap.get('metadata.load')!;

    mockEngine.load.mockImplementation(async (identity: MetadataIdentity) => {
      return {
        kind: identity.entityKind,
        identity,
        getAllFields: () => ({
          title: { value: 'IPC Overridden Title', source: 'user', confidence: 1 },
          language: { value: 'Telugu', source: 'user', confidence: 1 }
        })
      };
    });

    const identityPayload = { entityKind: MetadataKinds.Song, entityId: 101 };

    // 1. Invoke setBatch
    const setResult = await setBatchHandler(null, {
      identity: identityPayload,
      overrides: { title: 'IPC Overridden Title', language: 'Telugu' }
    });
    expect(setResult).toEqual({ success: true });
    expect(mockUserService.setOverrides).toHaveBeenCalled();

    // 2. Invoke load
    const getResult = await loadHandler(null, identityPayload);
    expect(getResult).not.toBeNull();
    expect(getResult.fields.title.value).toBe('IPC Overridden Title');
    expect(getResult.fields.language.value).toBe('Telugu');
  });
});
