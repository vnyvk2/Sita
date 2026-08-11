import type { SongMetadataSnapshot, MetadataHistorySnapshot } from '../history/MetadataHistoryService';
import type { UndoToken } from '../domain/UndoToken';

export interface DraftSnapshot {
  songId: number;
  filePath: string;
  previousTags: Record<string, string | number | undefined>;
  appliedTags: Record<string, string | number | undefined>;
  providerAttributions?: Record<string, { providerId: string; confidenceScore?: number }>;
}

export class SnapshotBuilder {
  public static buildHistorySnapshot(
    _operationId: string,
    undoToken: UndoToken,
    drafts: DraftSnapshot[]
  ): MetadataHistorySnapshot {
    const previousSongs: SongMetadataSnapshot[] = drafts.map((d) => ({
      songId: d.songId,
      path: d.filePath,
      title: (d.previousTags.title as string) ?? '',
      artist: d.previousTags.artist as string | undefined,
      album: d.previousTags.album as string | undefined,
      year: d.previousTags.year as number | undefined
    }));

    const updatedSongs: SongMetadataSnapshot[] = drafts.map((d) => ({
      songId: d.songId,
      path: d.filePath,
      title: (d.appliedTags.title as string) ?? '',
      artist: d.appliedTags.artist as string | undefined,
      album: d.appliedTags.album as string | undefined,
      year: d.appliedTags.year as number | undefined
    }));

    return {
      id: undoToken.id,
      timestamp: undoToken.timestamp,
      description: undoToken.description,
      songIds: drafts.map((d) => d.songId),
      previousSongs,
      updatedSongs
    };
  }
}
