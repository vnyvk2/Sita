import { describe, expect, it } from 'vitest';

import { MetadataConfidence } from '@main/metadata/models/MetadataConfidence';
import { MetadataFieldDefinition } from '@main/metadata/models/MetadataFieldDefinition';
import { MetadataSource, MetadataSourceTypes } from '@main/metadata/models/MetadataSource';
import { MetadataValue } from '@main/metadata/models/MetadataValue';

import { DefaultConflictPolicy } from '@main/metadata/policies/DefaultConflictPolicy';
import { DefaultMergePolicy } from '@main/metadata/policies/DefaultMergePolicy';
import { DefaultOverwritePolicy } from '@main/metadata/policies/DefaultOverwritePolicy';
import { DefaultValidationPolicy } from '@main/metadata/policies/DefaultValidationPolicy';

describe('Metadata Default Policies', () => {
  it('should validate number and range constraints in DefaultValidationPolicy', () => {
    const policy = new DefaultValidationPolicy();
    const yearDef = new MetadataFieldDefinition({
      id: 'year',
      displayName: 'Year',
      valueType: 'number'
    });

    expect(policy.validate(yearDef, 2024).valid).toBe(true);
    expect(policy.validate(yearDef, 500).valid).toBe(false);
    expect(policy.validate(yearDef, 'not a number').valid).toBe(false);
  });

  it('should resolve higher confidence in DefaultConflictPolicy', () => {
    const policy = new DefaultConflictPolicy();
    const existing = new MetadataValue({ value: 'Rock', confidence: new MetadataConfidence(0.5) });
    const incoming = new MetadataValue({ value: 'Hard Rock', confidence: new MetadataConfidence(0.9) });

    const resolved = policy.resolve({ fieldId: 'genre', existingValue: existing, incomingValue: incoming });
    expect(resolved.value).toBe('Hard Rock');
  });

  it('should merge values by confidence in DefaultMergePolicy', () => {
    const policy = new DefaultMergePolicy<string>();
    const low = new MetadataValue({ value: 'Rock', confidence: new MetadataConfidence(0.4) });
    const high = new MetadataValue({ value: 'Progressive Rock', confidence: new MetadataConfidence(0.9) });

    const merged = policy.merge([low, high]);
    expect(merged.value).toBe('Progressive Rock');
  });

  it('should evaluate overwrite priority in DefaultOverwritePolicy', () => {
    const policy = new DefaultOverwritePolicy();
    const userSource = new MetadataSource({ type: MetadataSourceTypes.UserEdit, priority: 100 });
    const tagSource = new MetadataSource({ type: MetadataSourceTypes.LocalTags, priority: 80 });

    expect(policy.canOverwrite(tagSource, userSource)).toBe(true);
    expect(policy.canOverwrite(userSource, tagSource)).toBe(false);
  });
});
