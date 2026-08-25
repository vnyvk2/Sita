# Tiny Mini — State Ownership & Import Audit (Phase 0 artifact P0-2)

Status: verified against commit at time of Phase 0. Every claim below was traced from source.

## 1. Where authoritative state actually lives

| State | Owner | Persistence | Evidence |
|---|---|---|---|
| Audio playback (element, WebAudio EQ, gain) | Renderer — [`AudioPlayer`](../../src/renderer/src/other/player.ts:44) singleton | none (volatile) | owns `HTMLAudioElement`, `AudioContext`, `BiquadFilterNode`s |
| Queue(s), active queue, position | Renderer — [`QueuesManager`](../../src/renderer/src/other/queuesManager.ts:56) / `PlayerQueue` | **renderer localStorage** | `storage.queue.getQueue()` restore in `initialize()` |
| UI/app state (`currentSongData`, `playerType`, notifications…) | Renderer TanStack store ([store.ts](../../src/renderer/src/store/store.ts)) wrapping [appReducer](../../src/renderer/src/other/appReducer.tsx) | localStorage subset via `UPDATE_LOCAL_STORAGE` | reducer defaults at line 687 |
| Window geometry, `miniPlayerMode`, always-on-top, pinned controls | Main process settings DB | SQLite (`user_settings` table) | [schema.ts](../../src/main/db/schema.ts:539–587) |
| Library, songs, playlists, history | Main process DB | SQLite | — |
| Server-cache (song/settings/lyrics queries) | Renderer TanStack Query | memory only | mounted in [index.tsx](../../src/renderer/src/index.tsx:70) |

**Consequence:** the experiment brief's assumption "authoritative playback lives in Main" is wrong.
Tiny must reuse the renderer-side playback modules as the single engine. There is no main-process
playback authority to fall back on, and creating one is out of scope.

## 2. Shared-state target (invariant R2)

```text
                 Shared Renderer State
                         │
          ┌──────────────┼──────────────┐
          │              │              │
      AudioPlayer   QueuesManager   Store
          │              │              │
          └──────────────┼──────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
     Standard         Compact           Tiny
      Mini UI          Mini UI          Mini UI
```

Singleton mechanics today: `useAudioPlayer()` memoizes on a module-level variable and mirrors to
`window.__NORA_AUDIO_PLAYER__`; `getQueuesManager()` likewise. Any Tiny entry must consume these
same singletons, never construct new instances.

## 3. Import allow-list (what a Tiny entry MAY load)

Traced from actual imports of the existing Mini components:

**Playback core (required):**
- `src/renderer/src/other/player.ts` — AudioPlayer
- `src/renderer/src/other/queuesManager.ts` + `playerQueue.ts`
- `src/renderer/src/other/positionScheduler.ts` — cadence policy (100 ms visible / 1 s hidden / paused stops)
- `src/renderer/src/utils/localStorage.ts`
- `src/renderer/src/other/toggleSongIsFavorite.ts`

**Store slice (required):**
- `src/renderer/src/store/store.ts` + `appReducer.tsx` (single shared store; no Tiny store)

**IPC surface (required):**
- `window.api.playerControls`, `window.api.miniPlayer`, `window.api.settings`,
  `window.api.windowControls`, `window.api.dataUpdates` (see TINY_IPC_CONTRACT.md)

**UI primitives (optional, dependency-free):**
- `components/Button`, `components/Img`, `components/SeekBarSlider`, `components/VolumeSlider`,
  `components/Icons/*`, `utils/calculateTimeFromSeconds`, `@common/miniPlayerConstants`

## 4. Deny-list (what a Tiny entry MUST NOT load)

| Forbidden | Reason | Evidence of coupling today |
|---|---|---|
| `routeTree.gen.ts` / router | full navigation tree | imported by entry index.tsx |
| `queries/**` (TanStack Query modules) | drags queryClient ecosystem | MiniPlayer.tsx imports `settingsQuery/settingsMutation`; QueueContainer imports `songQuery`; LyricsContainer imports lyrics query |
| `queryClient.ts` / QueryClientProvider | server-cache infra Tiny v1 doesn't need | entry index.tsx mounts it globally |
| `contexts/AppUpdateContext` | ~30-callback god-context wired in App.tsx | every Mini component consumes it |
| Router providers, `CollectionEventProvider`, `UndoShortcutProvider`, `ReactQueryDevtools` | full-app infrastructure | entry index.tsx |
| `i18n.ts` / react-i18next | translation runtime | all Mini components use `useTranslation` |
| `material-symbols/rounded.css`, full `styles.css` | icon font + global stylesheet weight | imported at entry |
| Library pages, search, metadata tools, playlists | out of Tiny scope | routes tree |

**Key structural finding:** the existing Standard/Compact Mini components **cannot be reused** for
Tiny — they hard-depend on React Query, i18n, and `AppUpdateContext`. Tiny v1 must ship its own
minimal component set talking directly to the allow-listed modules. This is consistent with the
experiment goal (isolate renderer architecture) and does not modify Standard/Compact.

## 5. Configuration vs runtime state (invariant R3)

Allowed (existing shared Mini settings, read/write through existing IPC):
`miniPlayerMode` (extended with `'tiny'`), `miniPlayerPinnedControls`, `isMiniPlayerAlwaysOnTop`,
`miniPlayerX/Y/Width/Height`.

Forbidden (must never exist): `tinyQueue`, `tinyCurrentSong`, `tinyVolume`, `tinyPosition`,
`tinyPlayerState`, any Tiny-specific DB table or localStorage namespace.

## 6. Position updates

Reuse [`positionScheduler.ts`](../../src/renderer/src/other/positionScheduler.ts) unchanged. It
already implements: `PLAYING_VISIBLE` 100 ms, `PLAYING_HIDDEN` 1000 ms, `PAUSED` stopped,
`IDLE_NO_SONG` stopped, plus hidden→visible resync. No new cadence code is permitted in Tiny.

## 7. Artwork

Chain verified in existing Mini containers: `artworkPaths.optimizedArtworkPath` →
`artworkPaths.artworkPath` → bundled `DefaultSongCover`. Tiny adopts the identical chain.
