import type { Job, JobClass, JobState } from '../types';
import { SmartPlaylistEngine } from '../../collections/engine/SmartPlaylistEngine';

export class SmartPlaylistJob implements Job {
  public state: JobState = 'queued';
  public jobClass: JobClass = 'background';
  public retries = 0;
  public readonly maxRetries = 3;
  
  private engine = new SmartPlaylistEngine();

  constructor(
    public readonly id: string, // Expected to be `smart_playlist_regenerate_${playlistId}`
    private readonly playlistId: number
  ) {}

  public type = 'SmartPlaylistRegeneration';

  public async execute(): Promise<void> {
    await this.engine.regenerate(this.playlistId);
  }
}
