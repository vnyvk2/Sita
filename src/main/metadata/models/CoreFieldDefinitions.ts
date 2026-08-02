import { MetadataFieldDefinition } from './MetadataFieldDefinition';
import { MetadataFields } from './MetadataFieldId';

export const CORE_FIELD_DEFINITIONS: MetadataFieldDefinition[] = [
  new MetadataFieldDefinition({
    id: MetadataFields.Title,
    displayName: 'Title',
    valueType: 'string',
    searchable: true,
    filterable: true,
    sortable: true,
    indexed: true
  }),
  new MetadataFieldDefinition({
    id: MetadataFields.Artist,
    displayName: 'Artist',
    valueType: 'string',
    multiValue: true,
    searchable: true,
    filterable: true,
    sortable: true,
    indexed: true
  }),
  new MetadataFieldDefinition({
    id: MetadataFields.Album,
    displayName: 'Album',
    valueType: 'string',
    searchable: true,
    filterable: true,
    sortable: true,
    indexed: true
  }),
  new MetadataFieldDefinition({
    id: MetadataFields.Genre,
    displayName: 'Genre',
    valueType: 'string',
    multiValue: true,
    searchable: true,
    filterable: true,
    sortable: true,
    indexed: true
  }),
  new MetadataFieldDefinition({
    id: MetadataFields.BPM,
    displayName: 'BPM',
    valueType: 'number',
    searchable: false,
    filterable: true,
    sortable: true
  }),
  new MetadataFieldDefinition({
    id: MetadataFields.Year,
    displayName: 'Year',
    valueType: 'number',
    searchable: true,
    filterable: true,
    sortable: true
  }),
  new MetadataFieldDefinition({
    id: MetadataFields.Tag,
    displayName: 'Tag',
    valueType: 'string',
    multiValue: true,
    searchable: true,
    filterable: true,
    sortable: false,
    indexed: true
  }),
  new MetadataFieldDefinition({
    id: MetadataFields.Mood,
    displayName: 'Mood',
    valueType: 'string',
    multiValue: true,
    searchable: true,
    filterable: true,
    sortable: false,
    indexed: true
  })
];
