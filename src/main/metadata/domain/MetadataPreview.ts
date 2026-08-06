import type { ProviderAttribution } from './ProviderAttribution';

export type FieldChangeStatus = 'unchanged' | 'changed' | 'new' | 'missing';

export interface FieldChange {
  fieldId: string;
  fieldName: string;
  oldValue?: string | number;
  suggestedValue?: string | number;
  userValue?: string | number;
  status: FieldChangeStatus;
  applyField: boolean;
  attribution?: ProviderAttribution;
}

export interface OperationWarning {
  code: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  fieldId?: string;
}

export interface OperationConflict {
  fieldId: string;
  conflictingValues: Array<{
    providerId: string;
    value: string | number;
  }>;
}

export interface MetadataPreview {
  operationId: string;
  resourceId: string | number;
  overallConfidence: number;
  fieldChanges: FieldChange[];
  attributions: ProviderAttribution[];
  warnings: OperationWarning[];
  conflicts: OperationConflict[];
  applyResource: boolean;
}
