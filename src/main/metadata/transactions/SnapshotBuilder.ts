import type { UndoToken } from '../domain/UndoToken';
import type {
  SongMetadataSnapshot,
  MetadataHistorySnapshot
} from '../history/MetadataHistoryService';

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
      year: d.previousTags.year as number | undefined,
      trackNumber:
        d.previousTags.trackNumber !== undefined ? Number(d.previousTags.trackNumber) : undefined,
      discNumber:
        d.previousTags.discNumber !== undefined ? Number(d.previousTags.discNumber) : undefined,
      genre: d.previousTags.genre as string | undefined,
      isrc: d.previousTags.isrc as string | undefined,
      musicBrainzRecordingId: d.previousTags.musicBrainzRecordingId as string | undefined
    }));

    const updatedSongs: SongMetadataSnapshot[] = drafts.map((d) => ({
      songId: d.songId,
      path: d.filePath,
      title: (d.appliedTags.title as string) ?? '',
      artist: d.appliedTags.artist as string | undefined,
      album: d.appliedTags.album as string | undefined,
      year: d.appliedTags.year as number | undefined,
      trackNumber:
        d.appliedTags.trackNumber !== undefined ? Number(d.appliedTags.trackNumber) : undefined,
      discNumber:
        d.appliedTags.discNumber !== undefined ? Number(d.appliedTags.discNumber) : undefined,
      genre: d.appliedTags.genre as string | undefined,
      isrc: d.appliedTags.isrc as string | undefined,
      musicBrainzRecordingId: d.appliedTags.musicBrainzRecordingId as string | undefined
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
