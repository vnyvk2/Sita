import { describe, expect, it } from 'vitest';

import { MetadataEntity } from '@main/metadata/models/MetadataEntity';
import { MetadataIdentity } from '@main/metadata/models/MetadataIdentity';
import { MetadataKinds } from '@main/metadata/models/MetadataKind';
import { MetadataValue } from '@main/metadata/models/MetadataValue';

describe('MetadataEntity', () => {
  it('should initialize fields and manage metadata properties', () => {
    const identity = new MetadataIdentity({ entityKind: MetadataKinds.Artist, entityId: 'art-1' });
    const entity = new MetadataEntity({
      identity,
      fields: {
        name: new MetadataValue({ value: 'The Beatles' })
      }
    });

    expect(entity.kind).toBe(MetadataKinds.Artist);
    expect(entity.hasField('name')).toBe(true);
    expect(entity.getField<string>('name')?.value).toBe('The Beatles');

    entity.setField('genre', new MetadataValue({ value: 'Rock' }));
    expect(entity.hasField('genre')).toBe(true);
    expect(entity.getField<string>('genre')?.value).toBe('Rock');

    const snapshot = entity.createSnapshot();
    expect(snapshot.fields.name.value).toBe('The Beatles');
    expect(snapshot.fields.genre.value).toBe('Rock');
  });
});
