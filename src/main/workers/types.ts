export type JobClass = 'interactive' | 'background' | 'maintenance';

export type JobState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Job {
  /** Unique identifier for the job (e.g., albumId) to prevent duplicates */
  id: string;

  /** Type of job, useful for logging and metrics */
  type: string;

  /** Current state of the job */
  state: JobState;

  /** Execution class of the job. Dictates resource allocation by AdaptivePolicyEngine. */
  jobClass: JobClass;

  /** The maximum number of retries before a permanent failure. Default: 3 */
  maxRetries?: number;

  /** Current attempt count. */
  retries: number;

  /**
   * The core execution logic. Should be idempotent where possible. If it throws an error, the
   * scheduler will handle retrying.
   */
  execute: () => Promise<void>;

  /**
   * Optional cancellation logic. Called when the job is removed from the queue or aborted
   * mid-flight.
   */
  cancel?: () => void;

  /** Human-readable description of the job context (e.g. "Extracting palette for Album XYZ") */
  description: string;
}

export interface RunningJobInfo {
  id: string;
  type: string;
  description: string;
}

export interface EventTimelineEntry {
  timestamp: number;
  message: string;
}

export interface SchedulerMetrics {
  runningJobs: number;
  queuedJobs: number;
  completedJobs: number;
  failedJobs: number;

  completedLastMinute?: number;
  averageRuntime?: number;
  runningWorkers?: number;
  maxWorkers?: number;

  runningJobsList?: RunningJobInfo[];
  timeline?: EventTimelineEntry[];

  diagnostics?: {
    peakQueueSize: number;
    gcRunCount: number;
    recoveries: number;
  };
}
