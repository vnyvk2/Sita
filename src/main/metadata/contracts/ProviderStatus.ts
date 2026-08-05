export enum ProviderState {
  Uninitialized = 'Uninitialized',
  Initializing = 'Initializing',
  Healthy = 'Healthy',
  Degraded = 'Degraded',
  Offline = 'Offline',
  Failed = 'Failed'
}

export interface ProviderStatus {
  state: ProviderState;
  lastHealthCheck?: number;
  consecutiveFailures: number;
  lastErrorMessage?: string;
  latencyMs?: number;
}
