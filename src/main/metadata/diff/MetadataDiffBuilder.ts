import type { MetadataFieldDiff, MetadataFieldId, TrackMatchPreview } from '../../../common/metadata/types';
import { getMetadataFieldDisplayName } from '../../../common/metadata/displayNames';
import type { ProviderAttribution } from '../domain/ProviderAttribution';
import { extractStringValue, type OfficialTrackInput } from '../matching/TrackMatcher';
import type { MergedCandidateResult } from '../resolution/MetadataMergeEngine';
import { ProviderRegistry } from '../resolution/ProviderRegistry';
import type { LocalSongInput, TrackMatchPair } from '../services/AlbumMetadataService';
import { AlbumSuffixPreserver } from './AlbumSuffixPreserver';

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
   * Constructs presentation-friendly TrackMatchPreview for a remote release track that is missing from the local library.
   */
  public static buildMissingTrackPreview(
    remoteTrack: OfficialTrackInput,
    releaseContext?: { albumTitle?: string; artist?: string; year?: number; provider?: string }
  ): TrackMatchPreview {
    const rawArtist = extractStringValue(remoteTrack.artist ?? releaseContext?.artist);
    const rawAlbum = extractStringValue(remoteTrack.album ?? releaseContext?.albumTitle);
    const providerId = releaseContext?.provider ?? 'musicbrainz';
    const providerName = globalProviderRegistry.getDisplayName(providerId);

    const fieldDiffs: MetadataFieldDiff[] = [
      {
        fieldId: 'title',
        fieldName: 'Title',
        oldValue: undefined,
        suggestedValue: remoteTrack.title,
        userValue: remoteTrack.title,
        status: 'new',
        applyField: false,
        providerId,
        providerName
      },
      {
        fieldId: 'artist',
        fieldName: 'Artist',
        oldValue: undefined,
        suggestedValue: rawArtist,
        userValue: rawArtist,
        status: 'new',
        applyField: false,
        providerId,
        providerName
      },
      {
        fieldId: 'album',
        fieldName: 'Album',
        oldValue: undefined,
        suggestedValue: rawAlbum,
        userValue: rawAlbum,
        status: 'new',
        applyField: false,
        providerId,
        providerName
      },
      {
        fieldId: 'trackNumber',
        fieldName: 'Track Number',
        oldValue: undefined,
        suggestedValue: remoteTrack.trackNumber,
        userValue: remoteTrack.trackNumber,
        status: 'new',
        applyField: false,
        providerId,
        providerName
      },
      {
        fieldId: 'discNumber',
        fieldName: 'Disc Number',
        oldValue: undefined,
        suggestedValue: remoteTrack.discNumber ?? 1,
        userValue: remoteTrack.discNumber ?? 1,
        status: 'new',
        applyField: false,
        providerId,
        providerName
      }
    ];

    if (remoteTrack.musicBrainzRecordingId || remoteTrack.trackId) {
      fieldDiffs.push({
        fieldId: 'musicBrainzRecordingId',
        fieldName: 'MusicBrainz Recording ID',
        oldValue: undefined,
        suggestedValue: remoteTrack.musicBrainzRecordingId ?? remoteTrack.trackId,
        userValue: remoteTrack.musicBrainzRecordingId ?? remoteTrack.trackId,
        status: 'new',
        applyField: false,
        providerId,
        providerName
      });
    }

    if (remoteTrack.isrc) {
      fieldDiffs.push({
        fieldId: 'isrc',
        fieldName: 'ISRC',
        oldValue: undefined,
        suggestedValue: remoteTrack.isrc,
        userValue: remoteTrack.isrc,
        status: 'new',
        applyField: false,
        providerId,
        providerName
      });
    }

    return {
      localSongId: -(remoteTrack.trackNumber ?? 1),
      songPath: '',
      oldTitle: '',
      oldArtist: '',
      oldAlbum: '',
      oldYear: undefined,
      oldTrackNumber: remoteTrack.trackNumber,
      oldDiscNumber: remoteTrack.discNumber,
      confidence: 0,
      confidenceLevel: 'Low',
      why: 'Not in local library',
      reasons: ['missing_locally'],
      fieldDiffs,
      applyTrack: false,
      hasWarnings: false,
      warningCount: 0,
      isMissingLocally: true
    };
  }

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
    const rawSongGenre = extractStringValue(song.genre);

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
    const recIsrc = pair?.remoteTrack?.provider?.isrc ?? pair?.remoteTrack?.recording?.isrc ?? merged.isrc;
    const recMbid =
      pair?.remoteTrack?.provider?.providerRecordingId ??
      pair?.remoteTrack?.recording?.musicBrainzRecordingId ??
      merged.musicBrainzRecordingId;

    const fieldDiffs: MetadataFieldDiff[] = [
      this.compareField('title', 'Title', song.title, pair?.remoteTrack?.recording?.title ?? merged.title, merged.fieldAttributions.title, mapAlternatives('title')),
      this.compareField('artist', 'Artist', rawSongArtist, merged.artist, merged.fieldAttributions.artist, mapAlternatives('artist')),
      this.compareField('album', 'Album', rawSongAlbum, suggestedAlbum, merged.fieldAttributions.album, mapAlternatives('album')),
      this.compareField('year', 'Year', song.year, merged.year, merged.fieldAttributions.year, mapAlternatives('year')),
      this.compareField('trackNumber', 'Track Number', song.trackNumber, recTrackNo, merged.fieldAttributions.trackNumber, mapAlternatives('trackNumber')),
      this.compareField('discNumber', 'Disc Number', song.discNumber, recDiscNo, merged.fieldAttributions.discNumber, mapAlternatives('discNumber')),
      this.compareField('genre', 'Genre', rawSongGenre, merged.genre, merged.fieldAttributions.genre, mapAlternatives('genre')),
      this.compareField('isrc', 'ISRC', song.isrc, recIsrc, merged.fieldAttributions.isrc, mapAlternatives('isrc')),
      this.compareField('musicBrainzRecordingId', 'MusicBrainz Recording ID', song.musicBrainzRecordingId, recMbid, merged.fieldAttributions.musicBrainzRecordingId, mapAlternatives('musicBrainzRecordingId'))
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
      oldGenre: rawSongGenre,
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
    const rawSongGenre = extractStringValue(song.genre);

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
      this.compareField('genre', 'Genre', rawSongGenre, recording.genres?.[0], makeAttribution('genre')),
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
      oldArtist: rawSongArtist,
      oldAlbum: rawSongAlbum,
      oldYear: song.year,
      oldTrackNumber: song.trackNumber,
      oldDiscNumber: song.discNumber,
      oldGenre: rawSongGenre,
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
