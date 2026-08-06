import type { FieldContribution } from '../resolution/MetadataMergeEngine';

export interface MetadataContribution {
  providerId: string;
  providerName: string;
  confidenceScore: number;
  contributions: FieldContribution[];
}
