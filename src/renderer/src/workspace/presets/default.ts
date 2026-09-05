import type { Workspace } from '../types';

export const DEFAULT_PRESET: Workspace = {
  id: 'preset-default',
  name: 'Default',
  schemaVersion: 2,
  frame: {
    playerBar: 'bottom',
    playerBarCompact: false
  },
  root: {
    kind: 'panel',
    panel: 'p_main_default'
  },
  panels: {
    p_main_default: {
      id: 'p_main_default',
      type: 'router-view',
      local: {}
    }
  }
};
