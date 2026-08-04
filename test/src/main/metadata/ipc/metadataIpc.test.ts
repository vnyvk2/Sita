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

vi.mock('@db/db', () => ({
  db: {}
}));

import { registerMetadataIPCHandlers } from '@main/metadata/ipc/metadataIpc';
import { MetadataIdentity } from '@main/metadata/models/MetadataIdentity';
import { MetadataKinds } from '@main/metadata/models/MetadataKind';
import { MetadataBootstrap } from '@main/metadata/setup';

describe('metadataIpc', () => {
  beforeEach(() => {
    handlersMap.clear();
  });

  it('should register all metadata IPC channels', () => {
    registerMetadataIPCHandlers();

    expect(handlersMap.has('metadata:getMerged')).toBe(true);
    expect(handlersMap.has('metadata:setField')).toBe(true);
    expect(handlersMap.has('metadata:setFields')).toBe(true);
    expect(handlersMap.has('metadata:removeField')).toBe(true);
    expect(handlersMap.has('metadata:clearOverrides')).toBe(true);
  });

  it('should handle metadata:setFields and metadata:getMerged IPC calls', async () => {
    registerMetadataIPCHandlers();

    const container = await MetadataBootstrap.getInstance();
    const setFieldsHandler = handlersMap.get('metadata:setFields')!;
    const getMergedHandler = handlersMap.get('metadata:getMerged')!;

    // Mock local repository for getMerged return
    vi.spyOn(container.engine, 'load').mockImplementation(async (identity: MetadataIdentity) => {
      return {
        kind: identity.entityKind,
        identity,
        getAllFields: () => ({
          title: { value: 'IPC Overridden Title', source: 'user', confidence: 1 },
          language: { value: 'Telugu', source: 'user', confidence: 1 }
        })
      } as any;
    });

    const setFieldsSpy = vi.spyOn(container.userService, 'setOverrides').mockResolvedValue();

    const identityPayload = { entityKind: MetadataKinds.Song, entityId: 101 };

    // 1. Invoke setFields
    const setResult = await setFieldsHandler(null, {
      identity: identityPayload,
      overrides: { title: 'IPC Overridden Title', language: 'Telugu' }
    });
    expect(setResult).toEqual({ success: true });
    expect(setFieldsSpy).toHaveBeenCalled();

    // 2. Invoke getMerged
    const getResult = await getMergedHandler(null, identityPayload);
    expect(getResult).not.toBeNull();
    expect(getResult.fields.title.value).toBe('IPC Overridden Title');
    expect(getResult.fields.language.value).toBe('Telugu');
  });
});
