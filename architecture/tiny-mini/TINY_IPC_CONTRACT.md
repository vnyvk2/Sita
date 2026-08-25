# Tiny Mini — IPC Contract Inventory (Phase 0 artifact P0-3)

Status: verified against [`src/preload/index.ts`](../../src/preload/index.ts) and the matching
`ipcMain` handlers in [`src/main/ipc.ts`](../../src/main/ipc.ts) / [`src/main/main.ts`](../../src/main/main.ts).

**Headline result: Tiny v1 requires ZERO new IPC channels.** One existing channel needs a type-level
union extension only (`setMiniPlayerMode` accepting `'tiny'`).

## 1. Commands (renderer → main)

| Tiny need | Existing preload API | Channel | Verified |
|---|---|---|---|
| Mode switch | `miniPlayer.setMiniPlayerMode(mode)` | `app/setMiniPlayerMode` | [preload:575](../../src/preload/index.ts:575) — union `'standard' \| 'compact'` must extend to include `'tiny'`; handler in [main.ts:1099](../../src/main/main.ts:1099) |
| Player type switch (Tiny↔Normal) | `windowControls.changePlayerType(type)` | `app/changePlayerType` | [preload:62](../../src/preload/index.ts:62) |
| Always-on-top | `miniPlayer.toggleMiniPlayerAlwaysOnTop(state)` | `app/toggleMiniPlayerAlwaysOnTop` | [preload:560](../../src/preload/index.ts:560) |
| Reset position | `miniPlayer.resetToDefaultPosition()` | `app/resetMiniPlayerToDefault` | [preload:577](../../src/preload/index.ts:577) |
| Context menu | `miniPlayer.showContextMenu(template)` | `app/showMiniPlayerContextMenu` | [preload:571](../../src/preload/index.ts:571) |
| Read settings | `settings.getUserSettings()` | `app/getUserSettings` | [preload:393](../../src/preload/index.ts:393) |
| Save settings (mode, geometry) | `settings.saveUserSettings(partial)` | `app/saveUserSettings` | [preload:394](../../src/preload/index.ts:394) |
| Favorite toggle | `playerControls.toggleLikeSongs(ids, like?)` | `app/toggleLikeSongs` | [preload:91](../../src/preload/index.ts:91) |
| Playback state → main (taskbar/tray) | `playerControls.songPlaybackStateChange(isPlaying)` | `app/player/songPlaybackStateChange` | [preload:79](../../src/preload/index.ts:79) |
| Position → main | `playerControls.sendSongPosition(pos)` | `app/getSongPosition` | [preload:87](../../src/preload/index.ts:87) |
| Discord RPC | `playerControls.setDiscordRpcActivity(activity)` | `app/setDiscordRpcActivity` | [preload:88](../../src/preload/index.ts:88) |
| Song data at boot | `audioLibraryControls.checkForStartUpSongs()` / `getSong(id)` | `app/checkForStartUpSongs` / `app/getSong` | [preload:106–115](../../src/preload/index.ts:106) |

## 2. Events (main → renderer)

| Tiny need | Existing API | Channel | Notes |
|---|---|---|---|
| Media key / taskbar play-pause | `playerControls.toggleSongPlayback(cb)` | `app/player/toggleSongPlaybackState` | forwarded by main; Tiny must subscribe or media keys break |
| Skip forward | `playerControls.skipForwardToNextSong(cb)` | `app/player/skipForward` | same |
| Skip backward | `playerControls.skipBackwardToPreviousSong(cb)` | `app/player/skipBackward` | same |
| Library/data changes | `dataUpdates.dataUpdateEvent(cb)` | `app/dataUpdateEvent` | needed so a song edit (e.g. retitle) reflects in Tiny |
| Window focus/blur | `windowControls.onWindowFocus/onWindowBlur` | `app/focused` / `app/blurred` | optional for Tiny v1 |
| System theme | `theme.listenForSystemThemeChanges` | `app/systemThemeChange` | only if Tiny honors system theme |

## 3. Renderer-side feature obligations (degradation audit)

These features are triggered **from the renderer** today. If Tiny stops sending them, the feature
silently degrades even though main-process code is intact:

| Feature | Renderer obligation | Tiny v1 decision needed |
|---|---|---|
| Windows taskbar thumbnail buttons | `songPlaybackStateChange`, position updates | MUST keep — cheap |
| Discord RPC | `useDiscordRpc` hook drives `setDiscordRpcActivity` on song change/state | keep if "feature-honest" experiment; else document degradation |
| Last.fm scrobble / now-playing | renderer triggers via hooks (`sendNowPlayingSongDataToLastFM`, `scrobbleSong`) | same decision |
| Listening data / history recording | `useListeningData` + player events | MUST keep (user-facing data integrity) |
| Queue persistence | QueuesManager writes localStorage | automatic (shared module) |

Recommendation for the experiment: Tiny keeps playback-state, position, listening-data, and
scrobble/RPC obligations because they are event-driven from the shared AudioPlayer and cost ~nothing;
this keeps the comparison feature-honest.

## 4. Gaps found

1. **Type-only:** `miniPlayer.setMiniPlayerMode` parameter and return types are hardcoded
   `'standard' | 'compact'` ([preload:575](../../src/preload/index.ts:575)); the DB column already
   stores varchar with `$type<'standard' | 'compact'>` ([schema.ts:586](../../src/main/db/schema.ts:586)).
   Phase 1 extends both unions to `'tiny'`. No new channel.
2. **Boot-mode knowledge:** there is currently no mechanism for the renderer to know the persisted
   `miniPlayerMode` before React mounts (it reads it via query after boot). For Option B's split
   bootstrap, the loader needs the mode synchronously — options: read from `getUserSettings` before
   mounting (async, adds boot latency), or have main inject it during `did-finish-load` /
   via query param on load. **Open question flagged to Phase 1 planning** (see plan §13).
3. No `render-process-gone` handler exists in main — see PHASE_0_FINDINGS.md crash-recovery section.

## 5. Explicitly NOT needed by Tiny v1

Queue expansion IPC (`toggleMiniPlayerQueue/Lyrics`), lyrics queries, search, library, metadata,
collections, playlist IPC — all excluded per experiment scope.
