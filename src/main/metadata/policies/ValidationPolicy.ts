import type { MetadataFieldDefinition } from '../models/MetadataFieldDefinition';

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

export interface IValidationPolicy {
  validate(definition: MetadataFieldDefinition, value: unknown): ValidationResult;
}
