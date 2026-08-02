export interface OperationalRecommendation {
  id: string;
  title: string;
  description: string;
  actionable: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
}
