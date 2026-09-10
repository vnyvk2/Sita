import { SmartPlaylistEngine } from '@main/collections/engine/SmartPlaylistEngine';
import { SmartPlaylistJob } from '@main/workers/jobs/smartPlaylistJob';

describe('SmartPlaylistJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should regenerate the playlist', async () => {
    const job = new SmartPlaylistJob('test_id', 123);
    const regenerateSpy = vi
      .spyOn(SmartPlaylistEngine.prototype, 'regenerate')
      .mockResolvedValue(true);

    await job.execute();

    expect(regenerateSpy).toHaveBeenCalledWith(123);
    expect(regenerateSpy).toHaveBeenCalledTimes(1);

    regenerateSpy.mockRestore();
  });

  it('should have proper job properties', () => {
    const job = new SmartPlaylistJob('test_id', 123);
    expect(job.type).toBe('SmartPlaylistRegeneration');
    expect(job.state).toBe('queued');
    expect(job.jobClass).toBe('background');
    expect(job.maxRetries).toBe(3);
    expect(job.retries).toBe(0);
  });
});
