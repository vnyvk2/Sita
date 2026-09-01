# 11. IPC, Lifecycle & Platform Bridge Architecture

This document provides a comprehensive technical specification of Nora's **IPC Bridge, Electron Process Isolation, Native OS Integrations, and Platform Lifecycle Services**.

---

## 1. High-Level Subsystem Architecture

Nora strictly enforces Electron's context isolation architecture. The Chromium Renderer process has zero direct access to Node.js built-ins or local filesystem APIs; all communication routes through a hardened preload bridge and typed IPC channels.

```mermaid
graph TD
    subgraph RendererTier ["Chromium Renderer Tier (React UI)"]
        UI_Components[React UI Components]
        TanStack[TanStack Query]
        Zustand[Zustand Store]
    end

    subgraph PreloadTier ["Preload Context Bridge (src/preload/index.ts)"]
        ExposeAPI[contextBridge.exposeInMainWorld 'api']
        Invoker[window.api.invoke / window.api.send / window.api.on]
    end

    subgraph IPCTier ["IPC Dispatcher Tier (src/main/ipc.ts)"]
        IPCHandler[ipcMain.handle / ipcMain.on]
        PushStream[mainWindow.webContents.send]
    end

    subgraph NativeTier ["Native OS & Platform Integrations"]
        PowerMon[/Electron powerMonitor: Battery Awareness/]
        CustomProto[/handleFileProtocol: 'nora://' Audio Streamer/]
        DiscordRPC[/Discord Rich Presence Client/]
        LastFM[/Last.fm Scrobbler & Auth Manager/]
        WindowMgr[/Native Window, Tray & MiniPlayer Manager/]
    end

    UI_Components --> Invoker
    TanStack --> Invoker
    Zustand --> Invoker

    Invoker --> ExposeAPI
    ExposeAPI <==>|Isolated IPC| IPCHandler
    PushStream <==>|Isolated IPC| ExposeAPI

    IPCHandler --> NativeTier

    style RendererTier fill:#e1f5fe,stroke:#0288d1
    style PreloadTier fill:#f3e5f5,stroke:#7b1fa2
    style IPCTier fill:#dae8fc,stroke:#6c8ebf
    style NativeTier fill:#fff2cc,stroke:#d6b656
```

---

## 2. Detailed Process Breakdown

### Process 1: Electron Context Isolation & Preload Bridge (`src/preload/index.ts`)

Hardens the UI sandbox by exposing only explicitly whitelisted IPC invocation signatures to the `window.api` global object.

```mermaid
flowchart TD
    AppLaunch([Renderer Window Launched]) --> LoadPreload[Execute src/preload/index.ts]
    LoadPreload --> DefineAPI[Define Typed API Bridge Object]
    DefineAPI --> WhitelistChannels[Whitelist permitted channels: 'songs/*', 'collections/*', 'metadata/*']
    WhitelistChannels --> ExposeBridge[contextBridge.exposeInMainWorld 'api', api]
    ExposeBridge --> FreezeGlobal[Object.freeze window.api]
    FreezeGlobal --> UIBoot([React App Mounts with Protected Bridge])

    style ExposeBridge fill:#d5e8d4,stroke:#82b366
    style WhitelistChannels fill:#dae8fc,stroke:#6c8ebf
```

---

### Process 2: Type-Safe IPC Request/Response Dispatch

Routes incoming asynchronous renderer requests to authoritative domain engines.

```mermaid
flowchart TD
    UIInvoke([window.api.invoke channel, payload]) --> PreloadCheck{Is Channel Whitelisted?}
    PreloadCheck -->|No| RejectIPC[Reject with Security Error]
    PreloadCheck -->|Yes| IPCBridge[ipcRenderer.invoke]
    IPCBridge --> MainDispatch{ipcMain.handle Router}

    MainDispatch -->|'collections/*'| CollHandler[setupCollectionIpc]
    MainDispatch -->|'metadata/*'| MetaHandler[registerMetadataHandlers]
    MainDispatch -->|'playlistImport/*'| ImportHandler[setupPlaylistImportIpc]
    MainDispatch -->|'search/*'| SearchHandler[SearchCoordinator.query]
    MainDispatch -->|'songs/*'| SongHandler[Core Song Services]

    CollHandler --> ExecDomain[Domain Engine Execution]
    MetaHandler --> ExecDomain
    ImportHandler --> ExecDomain
    SearchHandler --> ExecDomain
    SongHandler --> ExecDomain

    ExecDomain --> ReturnResult[Serialize & Return Result DTO]
    ReturnResult --> UIResolve([Renderer Promise Resolves])

    style PreloadCheck fill:#dae8fc,stroke:#6c8ebf
    style ExecDomain fill:#d5e8d4,stroke:#82b366
    style RejectIPC fill:#f8cecc,stroke:#b85450
```

---

### Process 3: Bi-Directional Event Streaming & Push Notifications

Pushes background state changes (library scanning progress, asset generation, transaction completion) directly to the renderer.

```mermaid
flowchart TD
    BackgroundEvent([Background Event: e.g. ARTWORK_READY or Scan Progress]) --> PackageMsg[Build Structured Message Payload]
    PackageMsg --> SendWebContents[mainWindow.webContents.send 'messageCode', data]
    SendWebContents --> PreloadListener[Preload window.api.on listener]
    PreloadListener --> TanStackInval{Message Type?}
    TanStackInval -->|Data Update| InvalQuery[queryClient.invalidateQueries]
    TanStackInval -->|Scheduler Progress| UpdateStore[Update Zustand Observability State]
    TanStackInval -->|Notification| ShowToast[Display User Notification Toast]

    InvalQuery --> UIRender([React UI Re-renders with Fresh Data])
    UpdateStore --> UIRender
    ShowToast --> UIRender

    style PackageMsg fill:#dae8fc,stroke:#6c8ebf
    style SendWebContents fill:#d5e8d4,stroke:#82b366
    style InvalQuery fill:#ffe6cc,stroke:#d79b00
```

---

### Process 4: Custom Audio Streaming File Protocol (`nora://`)

The [`handleFileProtocol.ts`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/handleFileProtocol.ts) handler registers a secure custom `nora://` protocol allowing smooth, low-latency audio streaming with HTTP 206 Partial Content Range header support.

```mermaid
flowchart TD
    AudioRequest([HTML5 Audio requests 'nora://path/to/song.flac']) --> Intercept[handleFileProtocol intercepts request]
    Intercept --> DecodePath[Decode URI & Strip App Protocol Prefix]
    DecodePath --> CheckExists{File Exists on Disk?}
    CheckExists -->|No| Return404[Return HTTP 404 Not Found]
    CheckExists -->|Yes| ParseRange{Range Header Present?}
    ParseRange -->|Yes| StreamChunk[Stream File Slice with HTTP 206 Partial Content]
    ParseRange -->|No| StreamFull[Stream Full File with HTTP 200 OK]
    StreamChunk --> AudioBuffer([Seamless Web Audio Playback & Seeking])
    StreamFull --> AudioBuffer

    style StreamChunk fill:#d5e8d4,stroke:#82b366
    style StreamFull fill:#dae8fc,stroke:#6c8ebf
    style Return404 fill:#f8cecc,stroke:#b85450
```

---

### Process 5: Power Monitor & Battery-Adaptive Worker Policy

Dynamically throttles CPU-intensive background derived-asset workers when the host machine transitions to battery power.

```mermaid
flowchart TD
    PowerEvent([OS Power State Changed]) --> PowerMon{powerMonitor Listener}
    PowerMon -->|On Battery Power| BatteryMode[toggleOnBatteryPower true]
    PowerMon -->|On AC Power| ACMode[toggleOnBatteryPower false]

    BatteryMode --> AdaptiveEngine[adaptivePolicyEngine.applyPolicy]
    ACMode --> AdaptiveEngine

    AdaptiveEngine --> AdjustConcurrency[Adjust JobScheduler Limits]
    AdjustConcurrency -->|Battery| ThrottleLimits[interactive: 2, background: 1, maintenance: 0]
    AdjustConcurrency -->|AC Power| RestoreLimits[interactive: 4, background: 2, maintenance: 1]

    ThrottleLimits --> SchedulerUpdated([JobScheduler Operating in Power-Save Mode])
    RestoreLimits --> SchedulerUpdated

    style ThrottleLimits fill:#ffe6cc,stroke:#d79b00
    style RestoreLimits fill:#d5e8d4,stroke:#82b366
```

---

### Process 6: Discord Rich Presence & Last.fm Scrobbler

Synchronizes currently playing track metadata to external social and scrobbling networks asynchronously.

```mermaid
flowchart TD
    TrackPlay([Track Begins Playback]) --> CheckDiscord{Discord RPC Enabled?}
    CheckDiscord -->|Yes| SetRPC[discordRPC.setActivity: track, artist, album, elapsed]
    CheckDiscord -->|No| SkipRPC[Skip RPC]

    TrackPlay --> CheckLastFM{LastFM Connected?}
    CheckLastFM -->|Yes| SendNowPlaying[sendNowPlayingSongDataToLastFM]
    CheckLastFM -->|No| SkipLFM[Skip LastFM]

    TrackProgress([Playback Reaches 50% or 4 Minutes]) --> EnqueueScrobble[Enqueue Scrobble in scrobble_queue Table]
    EnqueueScrobble --> ProcessScrobble[Process Scrobble via Last.fm API with Retry]
    ProcessScrobble --> MarkScrobbleSuccess[Mark scrobble_queue status = 'completed']

    style SetRPC fill:#dae8fc,stroke:#6c8ebf
    style SendNowPlaying fill:#d5e8d4,stroke:#82b366
    style MarkScrobbleSuccess fill:#d5e8d4,stroke:#82b366
```

---

### Process 7: Native Window Management & Mini Player Modes

Manages window states, screen sleeping inhibition, system tray toggles, and seamless transitions between normal and mini player modes.

**Mini Player Modes**:

- **`standard`**: 3-tier deck layout with dedicated controls and artwork.
- **`compact`**: 1-tier progressive strip layout maximizing screen minimalism.

```mermaid
flowchart TD
    WindowAction([Window Command Received]) --> RouteAction{Action Type?}
    RouteAction -->|Toggle MiniPlayer| SwitchPlayerMode[changePlayerType: normal <-> mini]
    RouteAction -->|Set Mini Mode| SetMode[setMiniPlayerMode: standard vs compact]
    RouteAction -->|Prevent Sleep| BlockSleep[powerSaveBlocker.start 'prevent-display-sleep']
    RouteAction -->|Allow Sleep| AllowSleep[powerSaveBlocker.stop]
    RouteAction -->|Tray Single Click| ToggleVisibility[Toggle Main Window Visibility]

    SwitchPlayerMode --> SaveWindowBounds[Save Window Geometry in user_settings]
    SetMode --> SaveWindowBounds
    SaveWindowBounds --> WindowDone([Window State Updated])
    BlockSleep --> WindowDone
    AllowSleep --> WindowDone
    ToggleVisibility --> WindowDone

    style SwitchPlayerMode fill:#dae8fc,stroke:#6c8ebf
    style SetMode fill:#ffe6cc,stroke:#d79b00
    style BlockSleep fill:#d5e8d4,stroke:#82b366
```

---

## 3. Multi-Process Platform Bridge Choreography Graph

The following composite flowchart illustrates the platform bridge managing audio playback, OS power adaptations, social sync, and screen keep-alive states simultaneously:

```mermaid
graph TD
    TrackStart[Track Starts Playing in React UI] --> NoraProto[Process 4: Audio Streamed via nora:// with HTTP 206 Range]
    TrackStart --> BlockDisplaySleep[Process 7: powerSaveBlocker Inhibits Screen Sleep]
    TrackStart --> UpdateDiscord[Process 6: Discord Rich Presence Broadcast]
    TrackStart --> UpdateLastFM[Process 6: Last.fm Now Playing Signal]

    OSBattery[OS Switches to Battery Power] --> BatteryDetect[Process 5: powerMonitor Triggers adaptivePolicyEngine]
    BatteryDetect --> ThrottleWorkers[Process 5: JobScheduler Limits Throttled]

    TrackScrobble[Track Completes 50%] --> ScrobbleQueue[Process 6: Scrobble Queued & Processed]
    TrackEnd[Track Ends] --> AllowDisplaySleep[Process 7: Screen Sleep Restored if Paused]

    style TrackStart fill:#f5f5f5,stroke:#999999
    style NoraProto fill:#dae8fc,stroke:#6c8ebf
    style BatteryDetect fill:#ffe6cc,stroke:#d79b00
    style ScrobbleQueue fill:#d5e8d4,stroke:#82b366
```
