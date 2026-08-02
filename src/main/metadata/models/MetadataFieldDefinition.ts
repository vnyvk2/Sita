import type { FieldValueType } from '../common/types';

export interface MetadataFieldDefinitionOptions {
  id: string;
  displayName: string;
  description?: string;
  valueType: FieldValueType;
  multiValue?: boolean;
  searchable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  providerEditable?: boolean;
  userEditable?: boolean;
  indexed?: boolean;
}

export class MetadataFieldDefinition {
  public readonly id: string;
  public readonly displayName: string;
  public readonly description: string;
  public readonly valueType: FieldValueType;
  public readonly multiValue: boolean;
  public readonly searchable: boolean;
  public readonly filterable: boolean;
  public readonly sortable: boolean;
  public readonly providerEditable: boolean;
  public readonly userEditable: boolean;
  public readonly indexed: boolean;

  constructor(options: MetadataFieldDefinitionOptions) {
    this.id = options.id;
    this.displayName = options.displayName;
    this.description = options.description ?? '';
    this.valueType = options.valueType;
    this.multiValue = options.multiValue ?? false;
    this.searchable = options.searchable ?? true;
    this.filterable = options.filterable ?? true;
    this.sortable = options.sortable ?? false;
    this.providerEditable = options.providerEditable ?? true;
    this.userEditable = options.userEditable ?? true;
    this.indexed = options.indexed ?? false;
  }
}
