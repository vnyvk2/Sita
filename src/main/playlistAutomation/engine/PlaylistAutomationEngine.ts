import type { PlaylistEventBus } from '../events/PlaylistEventBus';
import type { AutomationScheduler } from '../scheduler/AutomationScheduler';
import type { PlaylistSyncWorkflow } from '../../playlistSync/workflow/PlaylistSyncWorkflow';
import type { PlaylistLink } from '../../playlistSync/models/PlaylistLink';
import type { PlaylistAutomationEvent } from '../models/PlaylistAutomationEvent';
import type { AutomationRule } from '../models/AutomationRule';

export class PlaylistAutomationEngine {
  private enabled = true;
  private rules = new Map<string, AutomationRule>();
  private links = new Map<string, PlaylistLink>();
  private playlistSongIdsProvider?: (playlistId: number) => Promise<number[]>;
  private unsubscribe?: () => void;

  constructor(
    private eventBus: PlaylistEventBus,
    private scheduler: AutomationScheduler,
    private syncWorkflow: PlaylistSyncWorkflow,
    playlistSongIdsProvider?: (playlistId: number) => Promise<number[]>
  ) {
    this.playlistSongIdsProvider = playlistSongIdsProvider;
    this.registerDefaultRules();
    this.listen();
  }

  private registerDefaultRules(): void {
    this.addRule({
      id: 'rule_file_change',
      name: 'Auto Sync On File Change',
      enabled: true,
      eventTypes: ['SOURCE_FILE_CHANGED'],
      debounceMs: 500
    });
  }

  private listen(): void {
    this.unsubscribe = this.eventBus.subscribe(async (event) => {
      if (!this.enabled) return;
      await this.handleEvent(event);
    });
  }

  registerLink(link: PlaylistLink): void {
    this.links.set(link.sourceFile, link);
  }

  addRule(rule: AutomationRule): void {
    this.rules.set(rule.id, rule);
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getRules(): AutomationRule[] {
    return Array.from(this.rules.values());
  }

  private async handleEvent(event: PlaylistAutomationEvent): Promise<void> {
    const matchingRules = Array.from(this.rules.values()).filter(
      (r) => r.enabled && r.eventTypes.includes(event.type)
    );

    if (matchingRules.length === 0) return;

    const rule = matchingRules[0];

    this.scheduler.schedule(event, rule.debounceMs, async (e) => {
      await this.processSync(e);
    });
  }

  private async processSync(event: PlaylistAutomationEvent): Promise<void> {
    if (!event.sourceFile) return;

    const link = this.links.get(event.sourceFile);
    if (!link) return;

    const currentSongIds = this.playlistSongIdsProvider
      ? await this.playlistSongIdsProvider(link.playlistId)
      : [];

    const preview = await this.syncWorkflow.previewSync(link, currentSongIds);
    if (preview?.resolvedPlan && preview.resolvedPlan.hasChanges) {
      await this.syncWorkflow.executeSyncPlan(preview.resolvedPlan);
    }
  }

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this.scheduler.clearAll();
  }
}
