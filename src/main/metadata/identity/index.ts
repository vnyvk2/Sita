export type { CanonicalTrackIdentity } from './CanonicalTrackIdentity';
export {
  TrackIdentityMatcher,
  MIN_IDENTITY_MATCH_SCORE,
  type IdentityMatchResult,
  type IdentityMatchType,
  type ScoreBreakdown
} from './TrackIdentityMatcher';
export { toCanonicalFromSong, type MinimalSongRecord } from './adapters/SongToCanonicalIdentity';
export {
  toCanonicalFromSpotifyTrack,
  type SpotifyTrackInput
} from './adapters/SpotifyToCanonicalIdentity';
export {
  toCanonicalFromMusicBrainz,
  type MusicBrainzTrackInput
} from './adapters/MusicBrainzToCanonicalIdentity';
export {
  toCanonicalFromDiscogs,
  type DiscogsTrackInput,
  type DiscogsReleaseContext
} from './adapters/DiscogsToCanonicalIdentity';
