import type { MetadataFieldDiff, MetadataFieldId, TrackMatchPreview } from '../../../common/metadata/types';
import type { TrackMatchPair } from '../services/AlbumMetadataService';
import { AlbumSuffixPreserver } from './AlbumSuffixPreserver';
import { ProviderRegistry } from '../resolution/ProviderRegistry';

const globalProviderRegistry = new ProviderRegistry();

export class MetadataDiffBuilder {
  /**
   * Constructs presentation-friendly TrackMatchPreview with per-field diffs and provider attribution from a TrackMatchPair.
   */
  public static buildTrackPreview(pair: TrackMatchPair, registry?: ProviderRegistry): TrackMatchPreview {
    const song = pair.localSong;
    const recording = pair.remoteTrack.recording;
    const provider = pair.remoteTrack.provider;
    const providerId = provider.providerId || 'musicbrainz';
    const activeRegistry = registry ?? globalProviderRegistry;
    const providerName = activeRegistry.getDisplayName(providerId);

    const suggestedAlbum = AlbumSuffixPreserver.preserveAlbumSuffix(song.album, recording.album);

    const fieldDiffs: MetadataFieldDiff[] = [
      this.compareField('title', 'Title', song.title, recording.title, providerId, providerName),
      this.compareField('artist', 'Artist', song.artist, recording.artist, providerId, providerName),
      this.compareField('album', 'Album', song.album, suggestedAlbum, providerId, providerName),
      this.compareField('year', 'Year', song.year, recording.year, providerId, providerName),
      this.compareField('trackNumber', 'Track Number', song.trackNumber, recording.trackNumber, providerId, providerName),
      this.compareField('discNumber', 'Disc Number', song.discNumber, recording.discNumber, providerId, providerName),
      this.compareField('genre', 'Genre', song.genre, recording.genres?.[0], providerId, providerName),
      this.compareField('isrc', 'ISRC', song.isrc, provider.isrc, providerId, providerName),
      this.compareField('musicBrainzRecordingId', 'MusicBrainz ID', song.musicBrainzRecordingId, provider.providerRecordingId, providerId, providerName)
    ];

    const applyTrack = pair.confidence >= 0.75; // Default apply for Good+ matches

    const warnings = pair.reasons.filter(
      (r) => r.toLowerCase().includes('penalty') || r.toLowerCase().includes('mismatch') || r.toLowerCase().includes('duplicate')
    );

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
      applyTrack,
      hasWarnings: warnings.length > 0,
      warningCount: warnings.length
    };
  }

  private static compareField(
    fieldId: MetadataFieldId,
    fieldName: string,
    oldVal?: string | number,
    newVal?: string | number,
    providerId?: string,
    providerName?: string
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
    } else if (strOld && strNew) {
      const isNumericField = fieldId === 'trackNumber' || fieldId === 'discNumber' || fieldId === 'year';
      const isDifferent = isNumericField
        ? Number(strOld) !== Number(strNew)
        : strOld.toLowerCase().replace(/\s+/g, ' ') !== strNew.toLowerCase().replace(/\s+/g, ' ');

      if (isDifferent) {
        status = 'changed';
        applyField = true;
      }
    }

    return {
      fieldId,
      fieldName,
      oldValue: oldVal,
      suggestedValue: newVal,
      userValue: newVal, // Default to suggested value, editable by user in UI
      status,
      applyField,
      providerId,
      providerName
    };
  }
}
