import type { Workspace } from '../types';

export const DEFAULT_PRESET: Workspace = {
  id: 'preset-default',
  name: 'Default',
  schemaVersion: 1,
  frame: {
    playerBar: 'bottom',
    playerBarCompact: false
  },
  root: {
    kind: 'split',
    id: 's_root_default',
    axis: 'x',
    weights: [0.18, 0.82],
    children: [
      {
        kind: 'panel',
        panel: 'p_nav_default'
      },
      {
        kind: 'panel',
        panel: 'p_main_default'
      }
    ]
  },
  panels: {
    p_nav_default: {
      id: 'p_nav_default',
      type: 'navigation',
      local: {}
    },
    p_main_default: {
      id: 'p_main_default',
      type: 'router-view',
      local: {}
    }
  }
};
