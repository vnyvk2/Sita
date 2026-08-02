import { describe, expect, it } from 'vitest';

import { MetadataIdentity } from '@main/metadata/models/MetadataIdentity';
import { MetadataKinds } from '@main/metadata/models/MetadataKind';
import { MetadataSnapshot } from '@main/metadata/models/MetadataSnapshot';
import { MetadataValue } from '@main/metadata/models/MetadataValue';

describe('MetadataSnapshot', () => {
  it('should freeze and clone snapshot correctly', () => {
    const identity = new MetadataIdentity({ entityKind: MetadataKinds.Song, entityId: 10 });
    const snapshot = new MetadataSnapshot({
      identity,
      fields: { title: new MetadataValue({ value: 'Hotel California' }) }
    });

    const frozen = snapshot.freeze();
    expect(frozen.identity.entityId).toBe(10);
    expect(frozen.fields.title.value).toBe('Hotel California');
  });

  it('should calculate diff between two snapshots', () => {
    const identity = new MetadataIdentity({ entityKind: MetadataKinds.Song, entityId: 10 });

    const snapA = new MetadataSnapshot({
      identity,
      fields: {
        title: new MetadataValue({ value: 'Hotel California' }),
        genre: new MetadataValue({ value: 'Rock' })
      }
    });

    const snapB = new MetadataSnapshot({
      identity,
      fields: {
        title: new MetadataValue({ value: 'Hotel California' }),
        genre: new MetadataValue({ value: 'Classic Rock' })
      }
    });

    const diff = snapA.diff(snapB);
    expect(Object.keys(diff)).toEqual(['genre']);
    expect(diff.genre.current?.value).toBe('Rock');
    expect(diff.genre.other?.value).toBe('Classic Rock');
  });
});
