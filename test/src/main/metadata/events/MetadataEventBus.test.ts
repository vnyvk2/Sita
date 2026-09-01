import { MetadataEventBus } from '@main/metadata/events/MetadataEventBus';
import { MetadataIdentity } from '@main/metadata/models/MetadataIdentity';
import { MetadataKinds } from '@main/metadata/models/MetadataKind';
import { describe, expect, it } from 'vitest';

describe('MetadataEventBus', () => {
  it('should emit and receive typed metadata events', () => {
    const eventBus = new MetadataEventBus();
    const identity = new MetadataIdentity({ entityKind: MetadataKinds.Song, entityId: 50 });

    let receivedId: number | null = null;

    eventBus.on('MetadataCreated', (event) => {
      receivedId = Number(event.identity.entityId);
    });

    eventBus.emit('MetadataCreated', { identity });
    expect(receivedId).toBe(50);
  });
});
