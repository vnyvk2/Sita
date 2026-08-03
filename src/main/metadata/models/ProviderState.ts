export const ProviderStates = {
  Initializing: 'Initializing',
  Ready: 'Ready',
  Disabled: 'Disabled',
  Unavailable: 'Unavailable',
  Failed: 'Failed'
} as const;

export type ProviderState = (typeof ProviderStates)[keyof typeof ProviderStates];
