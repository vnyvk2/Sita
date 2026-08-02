export class MetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetadataError';
  }
}

export class MetadataNotFoundError extends MetadataError {
  constructor(entityKind: string, entityId: string | number) {
    super(`Metadata not found for ${entityKind} with id ${entityId}`);
    this.name = 'MetadataNotFoundError';
  }
}

export class MetadataConflictError extends MetadataError {
  constructor(field: string, reason: string) {
    super(`Metadata conflict on field '${field}': ${reason}`);
    this.name = 'MetadataConflictError';
  }
}

export class MetadataProviderError extends MetadataError {
  constructor(providerId: string, message: string) {
    super(`Metadata provider '${providerId}' error: ${message}`);
    this.name = 'MetadataProviderError';
  }
}

export class MetadataValidationError extends MetadataError {
  constructor(field: string, message: string) {
    super(`Metadata validation failed for field '${field}': ${message}`);
    this.name = 'MetadataValidationError';
  }
}
