import type { PlaylistAutomationEvent } from '../models/PlaylistAutomationEvent';

export type ScheduledTaskAction = (event: PlaylistAutomationEvent) => Promise<void>;

export class AutomationScheduler {
  private timers = new Map<string, NodeJS.Timeout>();

  schedule(event: PlaylistAutomationEvent, delayMs: number, action: ScheduledTaskAction): void {
    const key = event.sourceFile ?? `playlist_${event.playlistId}`;

    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key)!);
    }

    const timer = setTimeout(async () => {
      this.timers.delete(key);
      try {
        await action(event);
      } catch (error) {
        console.error('Error executing scheduled automation task:', error);
      }
    }, delayMs);

    this.timers.set(key, timer);
  }

  cancel(key: string): void {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key)!);
      this.timers.delete(key);
    }
  }

  clearAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}
