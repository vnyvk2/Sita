import type { ValueStatus } from '../common/types';
import { ValueStatuses } from '../common/types';
import { MetadataConfidence } from './MetadataConfidence';
import { MetadataSource, MetadataSourceTypes } from './MetadataSource';

export interface MetadataValueOptions<T> {
  value: T;
  source?: MetadataSource;
  confidence?: MetadataConfidence;
  status?: ValueStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export class MetadataValue<T> {
  public readonly value: T;
  public readonly source: MetadataSource;
  public readonly confidence: MetadataConfidence;
  public readonly status: ValueStatus;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(options: MetadataValueOptions<T>) {
    this.value = options.value;
    this.source =
      options.source ?? new MetadataSource({ type: MetadataSourceTypes.LocalTags });
    this.confidence = options.confidence ?? MetadataConfidence.default();
    this.status = options.status ?? ValueStatuses.Pending;
    this.createdAt = options.createdAt ?? new Date();
    this.updatedAt = options.updatedAt ?? new Date();
  }

  public withValue(newValue: T, newStatus?: ValueStatus): MetadataValue<T> {
    return new MetadataValue<T>({
      value: newValue,
      source: this.source,
      confidence: this.confidence,
      status: newStatus ?? this.status,
      createdAt: this.createdAt,
      updatedAt: new Date()
    });
  }

  public withStatus(newStatus: ValueStatus): MetadataValue<T> {
    return new MetadataValue<T>({
      value: this.value,
      source: this.source,
      confidence: this.confidence,
      status: newStatus,
      createdAt: this.createdAt,
      updatedAt: new Date()
    });
  }
}
