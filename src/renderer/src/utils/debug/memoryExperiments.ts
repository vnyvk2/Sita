export const MEMORY_EXPERIMENTS = {
  // Test A: Disable cloneDeep(currentState) in store.subscribe
  DISABLE_STORE_CLONE_LOGGING: false,

  // Test B: Disable LyricsAmbientBackground component entirely (render null)
  DISABLE_AMBIENT_BACKGROUND: false,

  // Test C: Disable per-line and per-word 10Hz positionChange listeners entirely
  DISABLE_LYRICS_POSITION_LISTENERS: false,

  // Test D: Suppress Last.fm online queries in dev mode
  SUPPRESS_LASTFM_ERRORS: false,
};
