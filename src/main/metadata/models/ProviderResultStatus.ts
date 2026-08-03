export const ProviderResultStatuses = {
  Success: 'success',
  Failed: 'failed',
  Timeout: 'timeout',
  Skipped: 'skipped'
} as const;

export type ProviderResultStatus =
  (typeof ProviderResultStatuses)[keyof typeof ProviderResultStatuses];
