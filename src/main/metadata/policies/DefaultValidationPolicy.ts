import type { MetadataFieldDefinition } from '../models/MetadataFieldDefinition';
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
      if (definition.id === 'year' && (value < 1000 || value > 3000)) {
        return { valid: false, message: `Field 'year' must be between 1000 and 3000` };
      }
      if (definition.id === 'bpm' && value < 0) {
        return { valid: false, message: `Field 'bpm' must be non-negative` };
      }
    }

    if (definition.valueType === 'string') {
      if (typeof value !== 'string') {
        return { valid: false, message: `Field '${definition.id}' must be a string` };
      }
    }

    if (definition.valueType === 'string[]') {
      if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
        return { valid: false, message: `Field '${definition.id}' must be an array of strings` };
      }
    }

    return { valid: true };
  }
}
