export interface TagWritePayload {
  filePath: string;
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  trackNumber?: number;
  discNumber?: number;
  genre?: string;
  isrc?: string;
  musicBrainzRecordingId?: string;
}

export interface TagWriteResult {
  filePath: string;
  success: boolean;
  error?: string;
}

export class TagWriterService {
  /**
   * Writes physical audio tags to disk for a file.
   */
  public async writeTags(payload: TagWritePayload): Promise<TagWriteResult> {
    try {
      if (!payload.filePath) {
        return { filePath: payload.filePath, success: false, error: 'Empty file path' };
      }

      const { withFileHandle } = await import('../../utils/withFileHandle');
      await withFileHandle(payload.filePath, async (file) => {
        if (payload.title) file.tag.title = payload.title;
        if (payload.artist) file.tag.performers = [payload.artist];
        if (payload.album) file.tag.album = payload.album;
        if (payload.genre) file.tag.genres = [payload.genre];
        if (payload.trackNumber !== undefined) file.tag.track = payload.trackNumber;
        if (payload.year !== undefined) file.tag.year = payload.year;
        file.save();
      });

      return { filePath: payload.filePath, success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { filePath: payload.filePath, success: false, error: msg };
    }
  }

  /**
   * Batch writes tags for multiple files.
   */
  public async writeBatch(payloads: TagWritePayload[]): Promise<TagWriteResult[]> {
    const results: TagWriteResult[] = [];
    for (const payload of payloads) {
      const res = await this.writeTags(payload);
      results.push(res);
    }
    return results;
  }
}
