import type { Workspace } from '../types';

export const MUSICBEE_PRESET: Workspace = {
  id: 'preset-musicbee',
  name: 'MusicBee',
  schemaVersion: 1,
  frame: {
    playerBar: 'bottom',
    playerBarCompact: false
  },
  root: {
    kind: 'split',
    id: 's_root_musicbee',
    axis: 'x',
    weights: [0.15, 0.6, 0.25],
    children: [
      {
        kind: 'panel',
        panel: 'p_nav_mb'
      },
      {
        kind: 'panel',
        panel: 'p_main_mb'
      },
      {
        kind: 'tabs',
        id: 't_right_mb',
        tabs: ['p_lyrics_mb', 'p_queue_mb'],
        active: 'p_lyrics_mb'
      }
    ]
  },
  panels: {
    p_nav_mb: {
      id: 'p_nav_mb',
      type: 'navigation',
      local: {}
    },
    p_main_mb: {
      id: 'p_main_mb',
      type: 'router-view',
      local: {}
    },
    p_lyrics_mb: {
      id: 'p_lyrics_mb',
      type: 'lyrics',
      local: {}
    },
    p_queue_mb: {
      id: 'p_queue_mb',
      type: 'queue',
      local: {}
    }
  }
};
