import type { PlaylistLink } from '../../playlistSync/models/PlaylistLink';
import type { PlaylistSyncPlan } from '../../playlistSync/models/PlaylistSyncPlan';

export interface SyncProvider {
  platformName: string;
  previewPlatformSync(link: PlaylistLink): Promise<PlaylistSyncPlan>;
}
