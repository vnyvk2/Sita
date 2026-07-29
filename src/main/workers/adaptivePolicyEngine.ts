import { powerMonitor, BrowserWindow } from 'electron';
import log from '../logger';
import { libraryScheduler } from './jobScheduler';
import type { JobClass } from './types';

export class AdaptivePolicyEngine {
  private pollingInterval: NodeJS.Timeout | null = null;
  private readonly defaultIntervalMs = 5000;
  
  // Track state to avoid redundant updates
  private currentPolicyName = '';
  
  private readonly boundEvaluatePolicy = () => this.evaluatePolicies('power-event');
  private readonly boundSuspendPolicy = () => this.evaluatePolicies('suspend');

  constructor() {}

  public start() {
    this.stop(); // Prevent duplicate starts
    this.setupEventListeners();
    this.startPolling();
    this.evaluatePolicies('Engine Started');
    log.info('[AdaptivePolicyEngine] Started');
  }

  public stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    powerMonitor.removeListener('on-battery', this.boundEvaluatePolicy);
    powerMonitor.removeListener('on-ac', this.boundEvaluatePolicy);
    powerMonitor.removeListener('suspend', this.boundSuspendPolicy);
    powerMonitor.removeListener('resume', this.boundEvaluatePolicy);
    powerMonitor.removeListener('lock-screen', this.boundEvaluatePolicy);
    powerMonitor.removeListener('unlock-screen', this.boundEvaluatePolicy);

    log.info('[AdaptivePolicyEngine] Stopped');
  }

  private setupEventListeners() {
    // Power Events
    powerMonitor.on('on-battery', this.boundEvaluatePolicy);
    powerMonitor.on('on-ac', this.boundEvaluatePolicy);
    powerMonitor.on('suspend', this.boundSuspendPolicy);
    powerMonitor.on('resume', this.boundEvaluatePolicy);
    powerMonitor.on('lock-screen', this.boundEvaluatePolicy);
    powerMonitor.on('unlock-screen', this.boundEvaluatePolicy);

    // Window Events are tricky as windows can be created/destroyed, 
    // but evaluatePolicies polls visibility anyway so it covers gaps.
  }

  private startPolling() {
    this.pollingInterval = setInterval(() => {
      this.evaluatePolicies('polling');
    }, this.defaultIntervalMs);
  }

  private evaluatePolicies(trigger: string) {
    if (trigger === 'suspend') {
      this.applyPolicy('SUSPENDED', {
        interactive: 0,
        background: 0,
        maintenance: 0
      });
      return;
    }

    const isOnBattery = powerMonitor.isOnBatteryPower();
    const idleTimeSeconds = powerMonitor.getSystemIdleTime();
    
    let isAppFocused = false;
    let isAppMinimized = true;
    
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      for (const win of windows) {
        if (win.isFocused()) isAppFocused = true;
        if (!win.isMinimized() && win.isVisible()) isAppMinimized = false;
      }
    } else {
      isAppMinimized = true;
    }

    // Determine Policy
    if (isOnBattery) {
      // Battery Policy: Conserve power, only allow minimal interactive jobs
      this.applyPolicy('BATTERY', {
        interactive: 2,
        background: 0, // Paused
        maintenance: 0 // Paused
      });
      return;
    }

    if (idleTimeSeconds > 300) { // 5 minutes
      // Idle Policy: Run everything at max speed
      this.applyPolicy('IDLE', {
        interactive: 4,
        background: 4,
        maintenance: 2
      });
      return;
    }

    if (isAppFocused) {
      // Focused Policy: Prioritize interactive work
      this.applyPolicy('FOCUSED', {
        interactive: 4,
        background: 1,
        maintenance: 0
      });
      return;
    }

    if (isAppMinimized) {
      // Minimized Policy: Increase background throughput
      this.applyPolicy('MINIMIZED', {
        interactive: 2,
        background: 4,
        maintenance: 1
      });
      return;
    }

    // Default AC Policy
    this.applyPolicy('AC_DEFAULT', {
      interactive: 4,
      background: 2,
      maintenance: 1
    });
  }

  private applyPolicy(policyName: string, limits: Record<JobClass, number>) {
    if (this.currentPolicyName !== policyName) {
      this.currentPolicyName = policyName;
      log.debug(`[AdaptivePolicyEngine] Applying policy: ${policyName}`, limits);
      libraryScheduler.setConcurrency(limits);
    }
  }
}

export const adaptivePolicyEngine = new AdaptivePolicyEngine();
