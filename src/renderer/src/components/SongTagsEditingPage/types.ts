/**
 * Extended SongTags type that includes user-override fields managed by the metadata override
 * platform. These fields are stored locally in Nora and do NOT modify the original audio files.
 */
export type EditableSongTags = SongTags & {
  language?: string;
  rating?: number;
  comment?: string;
  tags?: string[];
  discNumber?: number;
};

/**
 * The set of field IDs that can be written as user overrides via the metadata.override IPC channel.
 * Mirrors the BuiltInFieldId values that actually have corresponding UI controls.
 *
 * NOTE: 'trackNumber' is intentionally omitted because the track-number input writes directly to
 * the ID3 tag (not through the override platform).
 */
export type OverridableFieldId =
  | 'title'
  | 'composer'
  | 'comment'
  | 'language'
  | 'discNumber'
  | 'rating'
  | 'tags';
