# 06. Queue & Playback Subsystem Architecture

This document specifies the architecture, data models, permutation algorithms, and multi-queue synchronization mechanisms of Nora's **Queue & Playback Subsystem**.

---

## 1. Subsystem Architectural Philosophy

The playback queue is intentionally decoupled from persistent database collections:

- **Ephemeral & In-Memory**: Current playback state, shuffle permutations, cursor positions, and history stacks live in fast memory rather than disk databases.
- **Non-Destructive Shuffling**: Shuffling does not scramble the original track order. It maintains a **Shuffled Permutation Vector** (`shufflePermutation`) that maps logical playback positions to natural indices.
- **Separation of Structure vs. Membership**: Reordering or shuffling a queue does NOT invalidate React Query caches or trigger database refetches; only adding or removing distinct songs increments `membershipVersion`.

```mermaid
graph TD
    subgraph UI_Layer ["Renderer Tier (React & Zustand)"]
        UI_Player[Main Player / Mini Player / FullScreen Player]
        UI_QueueList[Queue List View / Drag & Drop Reorder]
        Store[(Zustand Store & LocalStorage)]
    end

    subgraph Client_Layer ["Renderer Queue Orchestration"]
        QManager(QueuesManager: Multi-Queue Coordinator)
        ActiveQ(PlayerQueue: Active Queue Controller)
    end

    subgraph Engine_Layer ["Main Process Queue Engine"]
        QEngine(QueueEngine: Pure State Machine)
        Permutation[shufflePermutation Array Mapping]
        HistoryStack[History Stack LIFO]
    end

    subgraph Audio_Layer ["Playback Engine"]
        AudioPipeline[/Web Audio / Howler Native Audio Stream/]
    end

    UI_Player --> QManager
    UI_QueueList --> QManager
    QManager ==> ActiveQ
    ActiveQ <==>|Bi-directional Sync| Store

    ActiveQ --> AudioPipeline
    ActiveQ --> QEngine
    QEngine ==> Permutation
    QEngine ==> HistoryStack

    style UI_Layer fill:#e1f5fe,stroke:#0288d1
    style Client_Layer fill:#d5e8d4,stroke:#82b366
    style Engine_Layer fill:#dae8fc,stroke:#6c8ebf
    style Audio_Layer fill:#ffe6cc,stroke:#d79b00
```

---

## 2. Detailed Process Breakdown

### Process 1: Queue Initialization & State Model

Represents the queue as an immutable state structure containing unique entry UUIDs, sources, and mode flags.

```ts
export interface QueueEntry {
  id: string; // Unique UUID for entry lifetime
  songId: number; // Relational song reference
  source: QueueEntrySource; // playlist | album | artist | genre | songs
  metadata?: Record<string, unknown>;
}

export interface QueueState {
  entries: QueueEntry[];
  currentEntryId?: string;
  history: string[]; // Past track IDs for 'goBack()'
  repeatMode: 'none' | 'one' | 'all';
  shuffleMode: boolean;
  shufflePermutation: number[]; // Maps playback index -> natural index
}
```

```mermaid
flowchart TD
    InitStart([Initialize Queue]) --> CreateUUIDs[Map songIds to QueueEntry with randomUUID]
    CreateUUIDs --> SetNaturalPerm[Set shufflePermutation = 0, 1, 2, ..., N-1]
    SetNaturalPerm --> SetCursor[Set currentEntryId = entries startingIndex .id]
    SetCursor --> CheckShuffle{shuffleMode Enabled?}
    CheckShuffle -->|Yes| RecomputePerm[Execute Fisher-Yates Recompute]
    CheckShuffle -->|No| InitDone([Queue Ready])
    RecomputePerm --> InitDone

    style CreateUUIDs fill:#dae8fc,stroke:#6c8ebf
    style SetNaturalPerm fill:#d5e8d4,stroke:#82b366
```

---

### Process 2: Permutation-Based Shuffle Algorithm

When shuffle mode is toggled, Nora never mutates the underlying `entries` array. Instead, it recomputes `shufflePermutation`.

**Fisher-Yates Algorithm with Active Track Anchoring**:

1. Identifies the currently playing track's natural index ($N_{\text{current}}$).
2. Collects all remaining indices ($i \neq N_{\text{current}}$).
3. Executes a Fisher-Yates shuffle on the remaining indices.
4. Places $N_{\text{current}}$ at index `0` of `shufflePermutation` so playback continues seamlessly without track jumps.

```mermaid
flowchart TD
    ShuffleStart([toggleShuffle Triggered]) --> CheckState{Is shuffleMode ON?}
    CheckState -->|Turning OFF| ResetPerm[Set shufflePermutation = 0..N-1]
    CheckState -->|Turning ON| FindCurrent[Find naturalIndex of currentEntryId]
    FindCurrent --> FilterIndices[Collect all indices i != currentNatural]
    FilterIndices --> LoopFY[Fisher-Yates Loop from len-1 down to 1]
    LoopFY --> SwapIndices[Swap indices i and floor random * i+1]
    SwapIndices --> LoopFY
    LoopFY -->|Finished| AnchorCurrent[Prepend currentNatural at position 0]
    AnchorCurrent --> SetPermState[Update state.shufflePermutation]
    ResetPerm --> SetPermState
    SetPermState --> ShuffleEnd([Shuffle Transition Complete])

    style AnchorCurrent fill:#d5e8d4,stroke:#82b366
    style ResetPerm fill:#ffe6cc,stroke:#d79b00
```

---

### Process 3: Bi-Directional Index Translation Mathematics

Translates between the natural order (the original list) and the playback order (the UI list in shuffle mode).

$$
\begin{aligned}
\text{playbackIndex}(n) &= \text{shufflePermutation}.\text{indexOf}(n) \\
\text{naturalIndex}(p) &= \text{shufflePermutation}[p] \\
\text{songToPlay}(p) &= \text{entries}[\text{shufflePermutation}[p]].\text{songId}
\end{aligned}
$$

```mermaid
graph LR
    subgraph PlaybackOrder ["Playback Order (UI View in Shuffle)"]
        P0["Position 0 (Current)"]
        P1["Position 1 (Next)"]
        P2["Position 2"]
        P3["Position 3"]
    end

    subgraph PermutationVector ["shufflePermutation Array"]
        V0["[3]"]
        V1["[0]"]
        V2["[2]"]
        V3["[1]"]
    end

    subgraph NaturalOrder ["Natural Array (Original Queue)"]
        N0["Entry 0: Song A"]
        N1["Entry 1: Song B"]
        N2["Entry 2: Song C"]
        N3["Entry 3: Song D"]
    end

    P0 --> V0 --> N3
    P1 --> V1 --> N0
    P2 --> V2 --> N2
    P3 --> V3 --> N1

    style PlaybackOrder fill:#e1f5fe,stroke:#0288d1
    style PermutationVector fill:#fff2cc,stroke:#d6b656
    style NaturalOrder fill:#dae8fc,stroke:#6c8ebf
```

---

### Process 4: Dynamic Queue Insertion (`addNext` & `addToEnd`)

Dynamically inserts new tracks without invalidating existing shuffle indices.

**Insertion Math for `addNext`**:

1. Computes `insertNaturalIndex = currentNatural + 1`.
2. Computes `insertPlaybackIndex = getPlaybackIndex(currentNatural) + 1`.
3. Slices new entries into `state.entries`.
4. Shifts all permutation values $\ge \text{insertNaturalIndex}$ by $+K$ (where $K = \text{newEntries.length}$).
5. Inserts new index range into `state.shufflePermutation` at `insertPlaybackIndex`.

```mermaid
flowchart TD
    InsertStart([addNext songIds]) --> MakeEntries[Generate QueueEntries with UUIDs]
    MakeEntries --> LocateCurrent[Locate currentNatural and currentPlayback]
    LocateCurrent --> SpliceEntries[state.entries.splice insertNaturalIndex, 0, newEntries]
    SpliceEntries --> AdjustPerm[Shift Permutation Values >= insertNaturalIndex by +K]
    AdjustPerm --> SplicePerm[state.shufflePermutation.splice insertPlaybackIndex, 0, newIndices]
    SplicePerm --> InsertDone([Insertion Complete with Preserved Permutation])

    style SpliceEntries fill:#dae8fc,stroke:#6c8ebf
    style AdjustPerm fill:#d5e8d4,stroke:#82b366
    style SplicePerm fill:#ffe6cc,stroke:#d79b00
```

---

### Process 5: Atomic $O(N)$ `playNext` with Duplicate Removal & Versioning

When a user clicks "Play Next" on an album or track, Nora atomically strips existing duplicate instances of those tracks from the queue and inserts the incoming batch in a single $O(N)$ operation.

**Version Optimization Guarantee**:

- **`structureVersion`** increments on every order or position change (triggers local UI animation).
- **`membershipVersion`** increments ONLY IF new distinct song IDs are added or duplicate counts change. If `playNext` merely shifts existing tracks, `membershipVersion` stays unchanged (0 DB refetches, 0 IPC roundtrips).

```mermaid
flowchart TD
    PlayNextStart([playNext songIds]) --> BuildSets[Build removalSet and incomingCounts Map]
    BuildSets --> ScanLoop[Single O N Pass over songIds]
    ScanLoop --> CheckRemoval{In removalSet?}
    CheckRemoval -->|Yes| IncRemoved[Increment removedCounts & track removedBeforeCurrent]
    CheckRemoval -->|No| KeepSong[Push to newSongIds]
    IncRemoved --> ScanLoop
    KeepSong --> ScanLoop

    ScanLoop -->|Done| CheckMemChange{incomingCounts == removedCounts?}
    CheckMemChange -->|Yes| KeepMemVer[Keep membershipVersion unchanged]
    CheckMemChange -->|No| IncMemVer[incrementMembershipVersion]

    KeepMemVer --> ComputeNewPos[Compute adjusted newPosition = position - removedBeforeCurrent]
    IncMemVer --> ComputeNewPos
    ComputeNewPos --> SpliceBatch[newSongIds.splice newPosition + 1, 0, incomingIds]
    SpliceBatch --> UpdateState[Update songIds & position]
    UpdateState --> IncStructVer[incrementStructureVersion]
    IncStructVer --> EmitQueueChange[Emit queueChange Event]

    style BuildSets fill:#dae8fc,stroke:#6c8ebf
    style KeepMemVer fill:#d5e8d4,stroke:#82b366
    style IncMemVer fill:#ffe6cc,stroke:#d79b00
    style SpliceBatch fill:#f8cecc,stroke:#b85450
```

---

### Process 6: Playback Navigation & History Stack (`advance` & `goBack`)

Coordinates cursor progression, repeat constraints, and back-button navigation.

```mermaid
flowchart TD
    AdvStart([Track Finished / advance Invoked]) --> CheckRepeatOne{repeatMode == 'one'?}
    CheckRepeatOne -->|Yes| RestartTrack[Keep currentEntryId & replay]
    CheckRepeatOne -->|No| PushHistory[history.push currentEntryId]
    PushHistory --> CalcNext[nextPlayback = currentPlayback + 1]
    CalcNext --> CheckEnd{nextPlayback >= entries.length?}
    CheckEnd -->|Yes & repeatMode == 'all'| LoopStart[nextPlayback = 0]
    CheckEnd -->|Yes & repeatMode == 'none'| EndQueue[currentEntryId = undefined Stop Playback]
    CheckEnd -->|No| ResolveNext[Resolve naturalIndex = shufflePermutation nextPlayback]
    LoopStart --> ResolveNext
    ResolveNext --> SetCurrent[currentEntryId = entries naturalIndex .id]
    SetCurrent --> AdvDone([Emit positionChange & Play Next])

    style PushHistory fill:#fff2cc,stroke:#d6b656
    style ResolveNext fill:#d5e8d4,stroke:#82b366
    style EndQueue fill:#f8cecc,stroke:#b85450
```

---

### Process 7: Multi-Queue Workspace Management (`QueuesManager.ts`)

Users can maintain multiple independent queue workspaces simultaneously (e.g. "Work Queue", "Chill Queue", "Workout").

```mermaid
flowchart TD
    QOpStart([Queue Workspace Action]) --> ActionType{Action?}
    ActionType -->|Create| CreateQ[Create PlayerQueue with unique title]
    ActionType -->|Switch| SwitchQ[Change activeQueueIndex & triggerStoreSync]
    ActionType -->|Lock/Unlock| ToggleLock[Toggle isLocked metadata flag]
    ActionType -->|Delete| DeleteQ{Is Queue Locked?}
    ActionType -->|Clear All| ClearAll[Filter: Keep active queue & all locked queues]

    DeleteQ -->|Yes| WarnLock[Block deletion with warning]
    DeleteQ -->|No| SpliceQ[Remove queue & adjust activeQueueIndex]

    CreateQ --> EmitQueuesChanged[Emit queuesChanged & activeQueueChanged]
    SwitchQ --> EmitQueuesChanged
    ToggleLock --> EmitQueuesChanged
    SpliceQ --> EmitQueuesChanged
    ClearAll --> EmitQueuesChanged

    style CreateQ fill:#d5e8d4,stroke:#82b366
    style ToggleLock fill:#fff2cc,stroke:#d6b656
    style ClearAll fill:#f8cecc,stroke:#b85450
```

---

### Process 8: Zustand Store & LocalStorage Synchronization

Ensures zero state divergence between the in-memory queue, React component trees, and persistent local storage.

```mermaid
flowchart TD
    QEvent([Queue Emits queueChange / positionChange]) --> CheckSyncing{isSyncingFromStore or isSyncingToStore?}
    CheckSyncing -->|Yes| PreventLoop[Break recursive sync loop]
    CheckSyncing -->|No| LockSync[isSyncingToStore = true]
    LockSync --> RecordVersions[Record lastSyncedStructureVersions]
    RecordVersions --> SetZustand[store.setState localStorage.queue]
    SetZustand --> UnlockSync[isSyncingToStore = false]

    SubTrigger([store.subscribe Fires on State Change]) --> CheckStoreSyncing{isSyncingToStore?}
    CheckStoreSyncing -->|Yes| IgnoreEcho[Ignore Local Echo]
    CheckStoreSyncing -->|No| CompareQueues[Compare structureVersion & songIds]
    CompareQueues --> NeedSync{State Changed?}
    NeedSync -->|Yes| InPlaceUpdate[q.replaceQueue or moveToPosition in-place]
    NeedSync -->|No| SyncedIdle([Store & Memory in Perfect Sync])
    InPlaceUpdate --> SyncedIdle

    style LockSync fill:#dae8fc,stroke:#6c8ebf
    style SetZustand fill:#d5e8d4,stroke:#82b366
    style InPlaceUpdate fill:#ffe6cc,stroke:#d79b00
```

---

## 3. Multi-Process Playback & Queue Choreography Graph

The following composite diagram illustrates the complete interactive lifecycle of queue playback:

```mermaid
graph TD
    UserAction[User Clicks 'Play Album'] --> InitQ[Process 1: Initialize Queue & UUIDs]
    InitQ --> ShuffleCheck{Shuffle Active?}
    ShuffleCheck -->|Yes| PermCalc[Process 2 & 3: Anchor Active Song & Compute Permutation]
    ShuffleCheck -->|No| NaturalCalc[Identity Permutation 0..N-1]
    PermCalc --> AudioPlay[Start Audio Stream on Position 0]
    NaturalCalc --> AudioPlay
    AudioPlay --> SyncStore[Process 8: Sync State & Versions to Zustand Store]

    UserNext[User Clicks 'Play Next' on Single Track] --> AtomicPlayNext[Process 5: O N Duplicate Cleanup & Play Next Insertion]
    AtomicPlayNext --> VersionCheck[Increment structureVersion / Evaluate membershipVersion]
    VersionCheck --> AudioPlay

    AudioEnd[Track Ends Naturally] --> NavAdvance[Process 6: advance Cursor & history.push]
    NavAdvance --> PermTranslate[Translate Natural Song from Permutation]
    PermTranslate --> AudioPlay

    style UserAction fill:#f5f5f5,stroke:#999999
    style AtomicPlayNext fill:#ffe6cc,stroke:#d79b00
    style AudioPlay fill:#d5e8d4,stroke:#82b366
    style SyncStore fill:#dae8fc,stroke:#6c8ebf
```
