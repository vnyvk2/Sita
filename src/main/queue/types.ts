export type QueueEntrySource = 
  | { type: 'playlist'; id: number }
  | { type: 'album'; id: number }
  | { type: 'artist'; id: number }
  | { type: 'genre'; id: number }
  | { type: 'songs' };

export interface QueueEntry {
  id: string; // Unique UUID for the lifetime of this entry in the queue
  songId: number;
  source: QueueEntrySource;
  metadata?: Record<string, unknown>; // For crossfade markers, AI radio tags, etc.
}

export interface QueueState {
  entries: QueueEntry[];
  
  // Stable tracking
  currentEntryId?: string; // Stable identifier for the currently playing track
  
  // Array management
  history: string[]; // Past track IDs (supports back button)
  
  // Playback modes
  repeatMode: 'none' | 'one' | 'all';
  shuffleMode: boolean;
  
  // Maps playback (shuffled) order index to natural (original) order index.
  // When shuffle is off, this is [0, 1, 2, ..., N-1].
  // Meaning the song to play at position `i` in the UI/queue is actually located at `entries[shufflePermutation[i]]`.
  shufflePermutation: number[]; 
}
