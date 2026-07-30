import type { AutomationEventType } from './PlaylistAutomationEvent';

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  eventTypes: AutomationEventType[];
  debounceMs: number;
}
