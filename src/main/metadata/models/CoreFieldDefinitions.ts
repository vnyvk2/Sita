import { MetadataFieldDefinition } from './MetadataFieldDefinition';

export const CORE_FIELD_DEFINITIONS: MetadataFieldDefinition[] = [
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
