export type JobPriority = 'high' | 'normal' | 'low';

export type JobState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Job {
  /** Unique identifier for the job (e.g., albumId) to prevent duplicates */
  id: string;
  
  /** Type of job, useful for logging and metrics */
  type: string;
  
  /** Current state of the job */
  state: JobState;
  
  /** Priority of the job. High priority jobs jump to the front of the queue. */
  priority: JobPriority;
  
  /** The maximum number of retries before a permanent failure. Default: 3 */
  maxRetries?: number;
  
  /** Current attempt count. */
  retries: number;

  /**
   * The core execution logic. Should be idempotent where possible.
   * If it throws an error, the scheduler will handle retrying.
   */
  execute: () => Promise<void>;
  
  /**
   * Optional cancellation logic. Called when the job is removed from the queue
   * or aborted mid-flight.
   */
  cancel?: () => void;
}
