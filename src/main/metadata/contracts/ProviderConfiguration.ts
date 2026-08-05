export interface ProviderConfiguration {
  enabled: boolean;
  priority: number;
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
  rateLimitMaxRequests?: number;
  rateLimitPerIntervalMs?: number;
  options?: Record<string, unknown>;
}
