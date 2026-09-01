import type { MetadataFieldDefinition } from '../models/MetadataFieldDefinition';
import { MetadataFields } from '../models/MetadataFieldId';
import type { IValidationPolicy, ValidationResult } from './ValidationPolicy';

export class DefaultValidationPolicy implements IValidationPolicy {
  public validate(definition: MetadataFieldDefinition, value: unknown): ValidationResult {
    if (value === undefined || value === null) {
      return { valid: true };
    }

    if (definition.valueType === 'number') {
      if (typeof value !== 'number' || isNaN(value)) {
        return { valid: false, message: `Field '${definition.id}' must be a valid number` };
      }
      if (definition.id === MetadataFields.Year && (value < 1000 || value > 3000)) {
        return {
          valid: false,
          message: `Field '${MetadataFields.Year}' must be between 1000 and 3000`
        };
      }
      if (definition.id === MetadataFields.BPM && value < 0) {
        return { valid: false, message: `Field '${MetadataFields.BPM}' must be non-negative` };
      }
    }

    if (definition.valueType === 'string') {
      if (definition.multiValue) {
        if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
          return { valid: false, message: `Field '${definition.id}' must be an array of strings` };
        }
      } else if (typeof value !== 'string') {
        return { valid: false, message: `Field '${definition.id}' must be a string` };
      }
    }

    return { valid: true };
  }
}
