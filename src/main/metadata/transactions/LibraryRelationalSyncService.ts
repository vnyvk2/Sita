import { removeDefaultAppProtocolFromFilePath } from '../../fs/resolveFilePaths';

export type SongDbUpdater = (
  songId: number,
  data: {
    title?: string;
    artist?: string;
    album?: string;
    genre?: string;
    style?: string;
    year?: number;
    trackNumber?: number;
    discNumber?: number;
    isrc?: string;
    musicBrainzRecordingId?: string;
    artworkPath?: string;
    artworkBuffer?: Buffer;
  }
) => Promise<unknown>;

export interface SyncResult {
  success: boolean;
  deferred?: boolean;
  warning?: string;
  fallbackUsed: boolean;
}

export class LibraryRelationalSyncService {
  private readonly dbUpdater?: SongDbUpdater;

  constructor(dbUpdater?: SongDbUpdater) {
    this.dbUpdater = dbUpdater;
  }

  /**
   * Synchronizes song metadata changes to the relational database tables (albums, artists, genres).
   */
  public async syncRelationalDatabase(
    songId: number,
    filePath: string,
    fieldMutations: Record<string, string | number>,
    tagPayload?: Record<string, string | number | Buffer>
  ): Promise<SyncResult> {
    if (this.dbUpdater) {
      try {
        const updateRes = await this.dbUpdater(songId, {
          title: fieldMutations.title as string | undefined,
          artist: fieldMutations.artist as string | undefined,
          album: fieldMutations.album as string | undefined,
          genre: fieldMutations.genre as string | undefined,
          style: fieldMutations.style as string | undefined,
          year: fieldMutations.year as number | undefined,
          trackNumber: fieldMutations.trackNumber as number | undefined,
          discNumber: fieldMutations.discNumber as number | undefined,
          isrc: fieldMutations.isrc as string | undefined,
          musicBrainzRecordingId: fieldMutations.musicBrainzRecordingId as string | undefined,
          artworkPath: fieldMutations.artworkPath as string | undefined,
          artworkBuffer: tagPayload?.artworkBuffer as Buffer | undefined
        });
        const isDeferred =
          typeof updateRes === 'object' && updateRes !== null && 'deferred' in updateRes
            ? Boolean((updateRes as { deferred?: boolean }).deferred)
            : false;
        return { success: true, deferred: isDeferred, fallbackUsed: false };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, warning: `DbUpdater failed (${msg})`, fallbackUsed: false };
      }
    }

    try {
      const { default: reParseSong } = await import('../../parseSong/reParseSong');
      const cleanPath = removeDefaultAppProtocolFromFilePath(filePath);
      await reParseSong(cleanPath);
      return { success: true, fallbackUsed: true };
    } catch (parseErr: unknown) {
      const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      return { success: false, warning: `reParseSong failed (${parseMsg})`, fallbackUsed: true };
    }
  }
}
