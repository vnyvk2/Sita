import type { MetadataFieldDiff, MetadataFieldId } from '../models/MetadataDiff';
import type { TrackMatchPreview } from '../models/AlbumTagPreview';
import type { TrackMatchPair } from '../services/AlbumMetadataService';

export class MetadataDiffBuilder {
  /**
   * Constructs presentation-friendly TrackMatchPreview with per-field diffs from a TrackMatchPair.
   */
  public static buildTrackPreview(pair: TrackMatchPair): TrackMatchPreview {
    const song = pair.localSong;
    const recording = pair.remoteTrack.recording;
    const provider = pair.remoteTrack.provider;

    const fieldDiffs: MetadataFieldDiff[] = [
      this.compareField('title', 'Title', song.title, recording.title),
      this.compareField('artist', 'Artist', song.artist, recording.artist),
      this.compareField('album', 'Album', song.album, recording.album),
      this.compareField('year', 'Year', song.year, recording.year),
      this.compareField('trackNumber', 'Track Number', song.trackNumber, recording.trackNumber),
      this.compareField('discNumber', 'Disc Number', song.discNumber, recording.discNumber),
      this.compareField('genre', 'Genre', song.genre, recording.genres?.[0]),
      this.compareField('isrc', 'ISRC', song.isrc, provider.isrc),
      this.compareField('musicBrainzRecordingId', 'MusicBrainz ID', song.musicBrainzRecordingId, provider.providerRecordingId)
    ];

    const applyTrack = pair.confidence >= 0.75; // Default apply for Good+ matches

    return {
      localSongId: song.songId,
      songPath: song.path,
      oldTitle: song.title,
      oldArtist: song.artist,
      oldAlbum: song.album,
      oldYear: song.year,
      oldTrackNumber: song.trackNumber,
      oldDiscNumber: song.discNumber,
      oldGenre: song.genre,
      oldIsrc: song.isrc,
      oldMbid: song.musicBrainzRecordingId,
      confidence: pair.confidence,
      confidenceLevel: pair.confidenceLevel ?? 'Good',
      why: pair.why ?? 'Matched Criteria',
      reasons: pair.reasons,
      fieldDiffs,
      applyTrack
    };
  }

  private static compareField(
    fieldId: MetadataFieldId,
    fieldName: string,
    oldVal?: string | number,
    newVal?: string | number
  ): MetadataFieldDiff {
    const strOld = oldVal !== undefined && oldVal !== null ? String(oldVal).trim() : '';
    const strNew = newVal !== undefined && newVal !== null ? String(newVal).trim() : '';

    let status: MetadataFieldDiff['status'] = 'unchanged';
    let applyField = false;

    if (!strOld && strNew) {
      status = 'new';
      applyField = true;
    } else if (strOld && !strNew) {
      status = 'missing';
      applyField = false;
    } else if (strOld && strNew && strOld.toLowerCase() !== strNew.toLowerCase()) {
      status = 'changed';
      applyField = true;
    }

    return {
      fieldId,
      fieldName,
      oldValue: oldVal,
      suggestedValue: newVal,
      userValue: newVal, // Default to suggested value, editable by user in UI
      status,
      applyField
    };
  }
}
