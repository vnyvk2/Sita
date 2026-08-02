import { CORE_FIELD_DEFINITIONS } from '../models/CoreFieldDefinitions';
import { MetadataFieldDefinition } from '../models/MetadataFieldDefinition';

export class MetadataFieldRegistry {
  private readonly fields: Map<string, MetadataFieldDefinition> = new Map();

  constructor(initialDefinitions: MetadataFieldDefinition[] = CORE_FIELD_DEFINITIONS) {
    for (const def of initialDefinitions) {
      this.fields.set(def.id, def);
    }
  }

  public register(field: MetadataFieldDefinition): void {
    this.fields.set(field.id, field);
  }

  public get(id: string): MetadataFieldDefinition | undefined {
    return this.fields.get(id);
  }

  public has(id: string): boolean {
    return this.fields.has(id);
  }

  public unregister(id: string): boolean {
    return this.fields.delete(id);
  }

  public getAll(): MetadataFieldDefinition[] {
    return Array.from(this.fields.values());
  }

  public clear(): void {
    this.fields.clear();
  }
}
