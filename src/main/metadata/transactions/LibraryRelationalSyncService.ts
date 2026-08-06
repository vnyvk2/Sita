import { removeDefaultAppProtocolFromFilePath } from '../../fs/resolveFilePaths';

export type SongDbUpdater = (
  songId: number,
  data: {
    title?: string;
    artist?: string;
    album?: string;
    genre?: string;
    year?: number;
    trackNumber?: number;
    discNumber?: number;
  }
) => Promise<unknown>;

export interface SyncResult {
  success: boolean;
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
    fieldMutations: Record<string, string | number>
  ): Promise<SyncResult> {
    if (this.dbUpdater) {
      try {
        await this.dbUpdater(songId, {
          title: fieldMutations.title as string | undefined,
          artist: fieldMutations.artist as string | undefined,
          album: fieldMutations.album as string | undefined,
          genre: fieldMutations.genre as string | undefined,
          year: fieldMutations.year as number | undefined,
          trackNumber: fieldMutations.trackNumber as number | undefined,
          discNumber: fieldMutations.discNumber as number | undefined
        });
        return { success: true, fallbackUsed: false };
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
