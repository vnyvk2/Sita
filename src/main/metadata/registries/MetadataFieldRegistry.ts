import { MetadataFieldDefinition } from '../models/MetadataFieldDefinition';

export class MetadataFieldRegistry {
  private static instance: MetadataFieldRegistry;
  private readonly fields: Map<string, MetadataFieldDefinition> = new Map();

  private constructor() {
    this.registerDefaultFields();
  }

  public static getInstance(): MetadataFieldRegistry {
    if (!MetadataFieldRegistry.instance) {
      MetadataFieldRegistry.instance = new MetadataFieldRegistry();
    }
    return MetadataFieldRegistry.instance;
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
    this.registerDefaultFields();
  }

  private registerDefaultFields(): void {
    const defaults: MetadataFieldDefinition[] = [
      new MetadataFieldDefinition({
        id: 'title',
        displayName: 'Title',
        valueType: 'string',
        searchable: true,
        filterable: true,
        sortable: true,
        indexed: true
      }),
      new MetadataFieldDefinition({
        id: 'artist',
        displayName: 'Artist',
        valueType: 'string',
        multiValue: true,
        searchable: true,
        filterable: true,
        sortable: true,
        indexed: true
      }),
      new MetadataFieldDefinition({
        id: 'album',
        displayName: 'Album',
        valueType: 'string',
        searchable: true,
        filterable: true,
        sortable: true,
        indexed: true
      }),
      new MetadataFieldDefinition({
        id: 'genre',
        displayName: 'Genre',
        valueType: 'string',
        multiValue: true,
        searchable: true,
        filterable: true,
        sortable: true,
        indexed: true
      }),
      new MetadataFieldDefinition({
        id: 'bpm',
        displayName: 'BPM',
        valueType: 'number',
        searchable: false,
        filterable: true,
        sortable: true
      }),
      new MetadataFieldDefinition({
        id: 'year',
        displayName: 'Year',
        valueType: 'number',
        searchable: true,
        filterable: true,
        sortable: true
      }),
      new MetadataFieldDefinition({
        id: 'tag',
        displayName: 'Tag',
        valueType: 'string',
        multiValue: true,
        searchable: true,
        filterable: true,
        sortable: false,
        indexed: true
      }),
      new MetadataFieldDefinition({
        id: 'mood',
        displayName: 'Mood',
        valueType: 'string',
        multiValue: true,
        searchable: true,
        filterable: true,
        sortable: false,
        indexed: true
      })
    ];

    for (const def of defaults) {
      this.fields.set(def.id, def);
    }
  }
}

export const metadataFieldRegistry = MetadataFieldRegistry.getInstance();
