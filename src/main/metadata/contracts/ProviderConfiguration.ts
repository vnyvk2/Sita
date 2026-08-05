export interface ProviderConfiguration {
  enabled: boolean;
  priority: number;
  language?: string;
  country?: string;
  strictMatching?: boolean;
  options?: Record<string, unknown>;
}
