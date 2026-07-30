export type AutomationEventType =
  | 'SOURCE_FILE_CHANGED'
  | 'PLAYLIST_CREATED'
  | 'PLAYLIST_DELETED'
  | 'SYNC_COMPLETED'
  | 'LIBRARY_UPDATED'
  | 'USER_REQUESTED_SYNC';

export interface PlaylistAutomationEvent {
  id: string;
  type: AutomationEventType;
  timestamp: Date;
  sourceFile?: string;
  playlistId?: number;
  payload?: Record<string, unknown>;
}
