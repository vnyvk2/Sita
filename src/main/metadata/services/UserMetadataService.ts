import type { MetadataEventBus } from '../events/MetadataEventBus';
import type { MetadataFieldId } from '../models/MetadataFieldId';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { MetadataOverrideValue } from '../repository/models/MetadataOverride';
import type { UserMetadataRepository } from '../repository/UserMetadataRepository';

export class UserMetadataService {
  private readonly repository: UserMetadataRepository;
  private readonly eventBus: MetadataEventBus;

  constructor(repository: UserMetadataRepository, eventBus: MetadataEventBus) {
    this.repository = repository;
    this.eventBus = eventBus;
  }

  public async setOverrides(
    identity: MetadataIdentity,
    overrides: Record<MetadataFieldId, MetadataOverrideValue>
  ): Promise<void> {
    await this.repository.setOverrides(identity, overrides);
    this.eventBus.emit('MetadataOverrideChanged', { identity });
  }

  public async removeOverride(
    identity: MetadataIdentity,
    fieldId: MetadataFieldId
  ): Promise<void> {
    await this.repository.removeOverride(identity, fieldId);
    this.eventBus.emit('MetadataOverrideChanged', { identity });
  }

  public async clearOverrides(identity: MetadataIdentity): Promise<void> {
    await this.repository.clearOverrides(identity);
    this.eventBus.emit('MetadataOverrideChanged', { identity });
  }
}
