# Migration from Prettier to Oxfmt

## Todo

- [x] Run automated migration: `npx oxfmt@latest --migrate prettier` <!-- id: 0 -->
- [x] Review and refine `.oxfmtrc.json` <!-- id: 1 -->
- [x] Update `package.json` scripts to use `oxfmt` <!-- id: 2 -->
- [x] Uninstall Prettier and its plugins <!-- id: 3 -->
- [x] Remove Prettier configuration files: `prettier.config.cjs` and `.prettierignore` <!-- id: 4 -->
- [x] Verify migration by running `oxfmt` on the project <!-- id: 5 -->

## Review

- Successfully migrated from Prettier to Oxfmt.
- Installed `oxfmt` as a dev dependency for consistent script behavior.
- Automated migration handled `prettier-plugin-tailwindcss` correctly.
- All scripts in `package.json` updated and verified.

---

# Canonical All Songs Queue — Pre-Merge Audit Follow-ups

Source: Tier 3 pre-merge audit of `canonical_all_songs_queue` (P0/P1 fixed on branch; items below deferred).

- [ ] **P2 — Cross-window in-place queue sync gap (pre-existing)**: `QueuesManager.setupStoreSync`
      detects content changes via the in-memory `structureVersion`, which is not serialized
      (`PlayerQueue.toJSON`), so a second window never receives in-place `songIds` mutations unless
      title/position/shuffle-presence also changed. Fix: compare `q.songIds` with `sq.songIds` (or
      serialize a membership counter) instead of relying on local structure versions.
- [ ] **P3 — SongCard standalone playback bypasses queue domain (pre-existing pattern)**: Home page
      cards call `playSong(songId)` directly without contextualizing `QueuesManager`; when the track
      ends, playback resumes from whatever queue was previously active. Decide whether to route these
      through canonical/contextual queue creation or keep as an accepted Nora pattern.
