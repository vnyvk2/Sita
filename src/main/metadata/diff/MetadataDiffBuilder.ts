import type { MetadataFieldDiff, MetadataFieldId, TrackMatchPreview } from '../../../common/metadata/types';
import type { TrackMatchPair, LocalSongInput } from '../services/AlbumMetadataService';
import { extractStringValue } from '../matching/TrackMatcher';
import { AlbumSuffixPreserver } from './AlbumSuffixPreserver';
import { ProviderRegistry } from '../resolution/ProviderRegistry';
import type { ProviderAttribution } from '../domain/ProviderAttribution';
import type { MergedCandidateResult } from '../resolution/MetadataMergeEngine';
import { getMetadataFieldDisplayName } from '../../../common/metadata/displayNames';

const globalProviderRegistry = new ProviderRegistry();

export interface CreateFieldDiffOptions {
  fieldId: MetadataFieldId;
  oldVal?: string | number;
  newVal?: string | number;
  providerId?: string;
  confidenceScore?: number;
  fieldName?: string;
}

export class MetadataDiffBuilder {
  /**
   * Constructs presentation-friendly TrackMatchPreview consuming an already-merged MergedCandidateResult with self-contained field-level alternatives.
   */
  public static buildTrackPreviewFromMergedResult(
    songOrPair: LocalSongInput | TrackMatchPair,
    merged: MergedCandidateResult,
    registry?: ProviderRegistry
  ): TrackMatchPreview {
    const activeRegistry = registry ?? globalProviderRegistry;
    const pair = 'localSong' in songOrPair ? songOrPair : undefined;
    const song = pair ? pair.localSong : (songOrPair as LocalSongInput);

    const rawSongAlbum = extractStringValue(song.album);
    const rawSongArtist = extractStringValue(song.artist);

    const suggestedAlbum = rawSongAlbum && merged.album
      ? AlbumSuffixPreserver.preserveAlbumSuffix(rawSongAlbum, merged.album)
      : merged.album;

    const mapAlternatives = (fieldId: string): Array<{ providerId: string; providerName: string; value: string | number }> | undefined => {
      const contribs = merged.fieldAlternatives?.[fieldId];
      if (!contribs || contribs.length === 0) return undefined;
      return contribs.map((c) => ({
        providerId: c.providerId,
        providerName: activeRegistry.getDisplayName(c.providerId),
        value: c.value,
        confidenceScore: c.confidenceScore
      }));
    };

    const recTrackNo = pair?.remoteTrack?.recording?.trackNumber;
    const recDiscNo = pair?.remoteTrack?.recording?.discNumber;

    const fieldDiffs: MetadataFieldDiff[] = [
      this.compareField('title', 'Title', song.title, pair?.remoteTrack?.recording?.title ?? merged.title, merged.fieldAttributions.title, mapAlternatives('title')),
      this.compareField('artist', 'Artist', rawSongArtist, merged.artist, merged.fieldAttributions.artist, mapAlternatives('artist')),
      this.compareField('album', 'Album', rawSongAlbum, suggestedAlbum, merged.fieldAttributions.album, mapAlternatives('album')),
      this.compareField('year', 'Year', song.year, merged.year, merged.fieldAttributions.year, mapAlternatives('year')),
      this.compareField('trackNumber', 'Track Number', song.trackNumber, recTrackNo, merged.fieldAttributions.trackNumber, mapAlternatives('trackNumber')),
      this.compareField('discNumber', 'Disc Number', song.discNumber, recDiscNo, merged.fieldAttributions.discNumber, mapAlternatives('discNumber')),
      this.compareField('genre', 'Genre', song.genre, merged.genre, merged.fieldAttributions.genre, mapAlternatives('genre'))
    ];

    const conf = pair?.confidence ?? 0.95;
    const applyTrack = conf >= 0.75;
    const warnings = pair?.reasons.filter(
      (r) => r.toLowerCase().includes('penalty') || r.toLowerCase().includes('mismatch') || r.toLowerCase().includes('duplicate')
    ) ?? [];

    return {
      localSongId: song.songId,
      songPath: song.path,
      oldTitle: song.title,
      oldArtist: rawSongArtist,
      oldAlbum: rawSongAlbum,
      oldYear: song.year,
      oldTrackNumber: song.trackNumber,
      oldDiscNumber: song.discNumber,
      oldGenre: song.genre,
      confidence: conf,
      confidenceLevel: pair?.confidenceLevel ?? 'Excellent',
      why: pair?.why ?? 'Multi-Provider Merged Resolution',
      reasons: pair?.reasons ?? ['Merged across active provider federation'],
      fieldDiffs,
      applyTrack,
      hasWarnings: warnings.length > 0,
      warningCount: warnings.length
    };
  }

  /**
   * Constructs presentation-friendly TrackMatchPreview with per-field diffs and ProviderAttribution domain models from a TrackMatchPair.
   */
  public static buildTrackPreview(pair: TrackMatchPair, registry?: ProviderRegistry): TrackMatchPreview {
    const song = pair.localSong;
    const rawSongAlbum = extractStringValue(song.album);
    const rawSongArtist = extractStringValue(song.artist);

    const recording = pair.remoteTrack.recording;
    const provider = pair.remoteTrack.provider;
    const providerId = provider.provider || 'musicbrainz';
    const activeRegistry = registry ?? globalProviderRegistry;
    const providerName = activeRegistry.getDisplayName(providerId);

    const makeAttribution = (fieldId: string): ProviderAttribution => ({
      fieldId,
      providerId,
      providerName,
      confidenceScore: pair.confidence
    });

    const suggestedAlbum = AlbumSuffixPreserver.preserveAlbumSuffix(rawSongAlbum, recording.album);

    const fieldDiffs: MetadataFieldDiff[] = [
      this.compareField('title', 'Title', song.title, recording.title, makeAttribution('title')),
      this.compareField('artist', 'Artist', rawSongArtist, recording.artist, makeAttribution('artist')),
      this.compareField('album', 'Album', rawSongAlbum, suggestedAlbum, makeAttribution('album')),
      this.compareField('year', 'Year', song.year, recording.year, makeAttribution('year')),
      this.compareField('trackNumber', 'Track Number', song.trackNumber, recording.trackNumber, makeAttribution('trackNumber')),
      this.compareField('discNumber', 'Disc Number', song.discNumber, recording.discNumber, makeAttribution('discNumber')),
      this.compareField('genre', 'Genre', song.genre, recording.genres?.[0], makeAttribution('genre')),
      this.compareField('isrc', 'ISRC', song.isrc, provider.isrc, makeAttribution('isrc')),
      this.compareField('musicBrainzRecordingId', 'MusicBrainz ID', song.musicBrainzRecordingId, provider.providerRecordingId, makeAttribution('musicBrainzRecordingId'))
    ];

    const applyTrack = pair.confidence >= 0.75;

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

  /**
   * Public helper to build a consistent MetadataFieldDiff between old and new values.
   * Supports both object-style options parameter and legacy positional arguments.
   */
  public static createFieldDiff(
    optionsOrFieldId: MetadataFieldId | CreateFieldDiffOptions,
    oldVal?: string | number,
    newVal?: string | number,
    providerId?: string,
    confidenceScore?: number,
    fieldName?: string
  ): MetadataFieldDiff {
    let opts: CreateFieldDiffOptions;
    if (typeof optionsOrFieldId === 'object') {
      opts = optionsOrFieldId;
    } else {
      opts = {
        fieldId: optionsOrFieldId,
        oldVal,
        newVal,
        providerId,
        confidenceScore,
        fieldName
      };
    }

    const resolvedName = opts.fieldName ?? getMetadataFieldDisplayName(opts.fieldId);
    const attribution = opts.providerId
      ? {
          fieldId: opts.fieldId,
          providerId: opts.providerId,
          providerName: globalProviderRegistry.getDisplayName(opts.providerId),
          confidenceScore: opts.confidenceScore ?? 0.9
        }
      : undefined;
    return this.compareField(opts.fieldId, resolvedName, opts.oldVal, opts.newVal, attribution);
  }

  private static compareField(
    fieldId: MetadataFieldId,
    fieldName: string,
    oldVal?: string | number,
    newVal?: string | number,
    attribution?: ProviderAttribution,
    alternatives?: Array<{ providerId: string; providerName: string; value: string | number }>
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
      userValue: newVal,
      status,
      applyField,
      providerId: attribution?.providerId,
      providerName: attribution?.providerName,
      alternatives
    };
  }
}
