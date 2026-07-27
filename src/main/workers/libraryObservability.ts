import { EventEmitter } from 'events';
import { libraryScheduler } from './jobScheduler';
import type { Job, RunningJobInfo, SchedulerMetrics, EventTimelineEntry } from './types';

export class LibraryObservabilityService extends EventEmitter {
  private completedTimestamps: number[] = [];
  private totalRuntimeMs = 0;
  private totalCompleted = 0;
  private timeline: EventTimelineEntry[] = [];
  
  // External subsystems can report these
  private gcRunCount = 0;
  private recoveries = 0;
  private peakQueueSize = 0;
  
  private batchStartTime = 0;
  private batchJobsProcessed = 0;
  private isBatchActive = false;

  private metricsUpdateTimeout: NodeJS.Timeout | null = null;
  private lastMetricsUpdate = 0;

  constructor() {
    super();
    this.registerSchedulerListeners();
  }

  private registerSchedulerListeners() {
    libraryScheduler.on('JOB_STARTED', (job: Job) => {
      this.recordPeakQueue();
      if (!this.isBatchActive) {
        this.isBatchActive = true;
        this.batchStartTime = Date.now();
        this.batchJobsProcessed = 0;
        this.addTimelineEvent('Library operation started');
      }
      this.throttledEmitMetrics();
    });

    libraryScheduler.on('JOB_COMPLETED', (job: Job, duration: number) => {
      this.completedTimestamps.push(Date.now());
      this.totalRuntimeMs += duration;
      this.totalCompleted++;
      if (this.isBatchActive) this.batchJobsProcessed++;
      this.throttledEmitMetrics();
    });

    libraryScheduler.on('JOB_FAILED', (job: Job, error: Error) => {
      this.addTimelineEvent(`Job failed: ${job.description} (${error.message})`);
      if (this.isBatchActive) this.batchJobsProcessed++;
      this.emitMetricsImmediate();
    });

    libraryScheduler.on('QUEUE_EMPTY', () => {
      if (this.isBatchActive) {
        const durationSeconds = Math.round((Date.now() - this.batchStartTime) / 1000);
        this.addTimelineEvent(`Library operation completed in ${durationSeconds}s`);
        
        import('../main').then(({ sendMessageToRenderer }) => {
          sendMessageToRenderer({
            messageCode: 'LIBRARY_BATCH_COMPLETE',
            data: { 
              jobsProcessed: this.batchJobsProcessed, 
              durationSeconds
            }
          });
        });

        this.isBatchActive = false;
      }
      this.emitMetricsImmediate();
      this.emit('QUEUE_EMPTY');
    });
  }

  private throttledEmitMetrics() {
    const now = Date.now();
    if (now - this.lastMetricsUpdate >= 250) {
      this.emitMetricsImmediate();
    } else if (!this.metricsUpdateTimeout) {
      this.metricsUpdateTimeout = setTimeout(() => {
        this.emitMetricsImmediate();
      }, 250 - (now - this.lastMetricsUpdate));
    }
  }

  private emitMetricsImmediate() {
    if (this.metricsUpdateTimeout) {
      clearTimeout(this.metricsUpdateTimeout);
      this.metricsUpdateTimeout = null;
    }
    this.lastMetricsUpdate = Date.now();
    this.emit('METRICS_UPDATED');
  }

  private static readonly TIMELINE_CAP = 100;

  public reportGcRun() {
    this.gcRunCount++;
    this.addTimelineEvent('Garbage collection completed');
    this.emit('METRICS_UPDATED');
  }

  public reportRecovery(count: number) {
    this.recoveries += count;
    this.addTimelineEvent(`Recovered ${count} stranded jobs`);
    this.emit('METRICS_UPDATED');
  }

  public addTimelineEvent(message: string) {
    this.timeline.push({ timestamp: Date.now(), message });
    if (this.timeline.length > LibraryObservabilityService.TIMELINE_CAP) {
      this.timeline.shift(); // Keep last TIMELINE_CAP events
    }
  }

  private recordPeakQueue() {
    const metrics = libraryScheduler.getRawMetrics();
    if (metrics.queuedJobs > this.peakQueueSize) {
      this.peakQueueSize = metrics.queuedJobs;
    }
  }

  public getTimeline() {
    return [...this.timeline];
  }

  public getMetrics(): SchedulerMetrics {
    const raw = libraryScheduler.getRawMetrics();
    const runningJobsList: RunningJobInfo[] = libraryScheduler.getRunningJobs().map(job => ({
      id: job.id,
      type: job.type,
      description: job.description
    }));

    // Clean up timestamps older than 1 minute
    const oneMinuteAgo = Date.now() - 60000;
    this.completedTimestamps = this.completedTimestamps.filter(t => t > oneMinuteAgo);

    const averageRuntime = this.totalCompleted > 0 
      ? Math.round(this.totalRuntimeMs / this.totalCompleted) 
      : 0;

    return {
      runningJobs: raw.runningJobs,
      queuedJobs: raw.queuedJobs,
      completedJobs: raw.completedJobs,
      failedJobs: raw.failedJobs,
      completedLastMinute: this.completedTimestamps.length,
      averageRuntime,
      runningWorkers: raw.runningJobs,
      maxWorkers: raw.maxWorkers,
      runningJobsList,
      timeline: this.getTimeline(),
      diagnostics: {
        peakQueueSize: this.peakQueueSize,
        gcRunCount: this.gcRunCount,
        recoveries: this.recoveries
      }
    };
  }
}

export const libraryObservability = new LibraryObservabilityService();
