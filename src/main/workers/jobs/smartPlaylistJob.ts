import { SmartPlaylistEngine } from '../../collections/engine/SmartPlaylistEngine';
import type { MembershipService } from '../../collections/membership/MembershipService';
import type { Job, JobClass, JobState } from '../types';

export class SmartPlaylistJob implements Job {
  public state: JobState = 'queued';
  public jobClass: JobClass = 'background';
  public retries = 0;
  public readonly maxRetries = 3;
  public readonly description: string;

  private engine: SmartPlaylistEngine;

  constructor(
    public readonly id: string, // Expected to be `smart_playlist_regenerate_${playlistId}`
    private readonly playlistId: number,
    private membershipService?: MembershipService
  ) {
    this.description = `Regenerating smart playlist ${playlistId}`;
    this.engine = new SmartPlaylistEngine(membershipService);
  }

  public type = 'SmartPlaylistRegeneration';

  public async execute(): Promise<void> {
    if (!this.membershipService) {
      try {
        const { membershipService } = await import('../../collections/setup');
        this.engine = new SmartPlaylistEngine(membershipService);
      } catch {
        // Fallback to engine without membership service if setup cannot be imported
      }
    }
    await this.engine.regenerate(this.playlistId);
  }
}
