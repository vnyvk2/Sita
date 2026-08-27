import type { AuthCredentials } from '../../platform/networking/Authenticator';
import type { RetryPolicy, RetryPolicyOptions } from '../../platform/networking/RetryPolicy';
import type { ProviderRetryPolicy } from '../providers/retry/ProviderRetryPolicy';

export interface ProviderConfiguration {
  enabled: boolean;
  priority: number;
  rateLimit?: number;
  retryPolicy?: RetryPolicy | RetryPolicyOptions | ProviderRetryPolicy;
  authCredentials?: AuthCredentials;
  language?: string;
  country?: string;
  strictMatching?: boolean;
  options?: Record<string, unknown>;
}
