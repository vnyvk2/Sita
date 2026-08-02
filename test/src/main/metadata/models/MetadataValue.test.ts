import { describe, expect, it } from 'vitest';

import { ValueStatuses } from '@main/metadata/common/types';
import { MetadataConfidence } from '@main/metadata/models/MetadataConfidence';
import { MetadataSource, MetadataSourceTypes } from '@main/metadata/models/MetadataSource';
import { MetadataValue } from '@main/metadata/models/MetadataValue';

describe('MetadataValue', () => {
  it('should create MetadataValue with default source and confidence', () => {
    const val = new MetadataValue<string>({ value: 'Rock' });
    expect(val.value).toBe('Rock');
    expect(val.source.type).toBe(MetadataSourceTypes.LocalTags);
    expect(val.confidence.score).toBe(0.5);
    expect(val.status).toBe(ValueStatuses.Pending);
  });

  it('should support updating value while preserving source and confidence', () => {
    const source = new MetadataSource({ type: MetadataSourceTypes.UserEdit, priority: 100 });
    const confidence = MetadataConfidence.verified();
    const val = new MetadataValue<string>({
      value: 'Pop',
      source,
      confidence,
      status: ValueStatuses.Pending
    });

    const updated = val.withValue('Pop Rock', ValueStatuses.Verified);
    expect(updated.value).toBe('Pop Rock');
    expect(updated.status).toBe(ValueStatuses.Verified);
    expect(updated.source.type).toBe(MetadataSourceTypes.UserEdit);
    expect(updated.confidence.score).toBe(1.0);
  });
});
