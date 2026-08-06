export type HealthRating = 'Poor' | 'Fair' | 'Good' | 'Excellent';

export interface HealthIssue {
  code: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  fieldId?: string;
}

export interface MetadataHealth {
  resourceId: string | number;
  resourceType: string;
  score: number; // 0 to 100
  rating: HealthRating;
  issues: HealthIssue[];
  assessedAt: number;
}
