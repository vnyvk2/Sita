import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

import type { PanelInstance, PanelKind, PanelType } from './types';

export interface PanelApi {
  instanceId: string;
  type: PanelType;
  setLocal: <T>(key: string, value: T | ((prev: T) => T)) => void;
  getLocal: <T>(key: string, defaultValue: T) => T;
  close: () => void;
  maximize: () => void;
}

export interface PanelProps {
  instance: PanelInstance;
  api: PanelApi;
}

export interface PanelDefinition {
  type: PanelType;
  title: string;
  icon: string;
  kind: PanelKind;
  singleton?: boolean;
  duplicate?: boolean;
  keepMounted?: boolean;
  minSize?: { w?: number; h?: number };
  defaultWeight?: number;
  component?: LazyExoticComponent<ComponentType<PanelProps>> | ComponentType<PanelProps>;
}

export const PANEL_DEFINITIONS: Record<PanelType, PanelDefinition> = {
  navigation: {
    type: 'navigation',
    title: 'Navigation',
    icon: 'explore',
    kind: 'widget',
    singleton: true,
    minSize: { w: 180 },
    defaultWeight: 0.18,
    component: lazy(() => import('./panels/NavigationPanel/NavigationPanel'))
  },
  'router-view': {
    type: 'router-view',
    title: 'Main View',
    icon: 'dashboard',
    kind: 'view',
    singleton: true,
    minSize: { w: 300 },
    defaultWeight: 0.6,
    component: lazy(() => import('./panels/RouterViewPanel/RouterViewPanel'))
  },
  queue: {
    type: 'queue',
    title: 'Queue',
    icon: 'queue_music',
    kind: 'widget',
    minSize: { w: 220 },
    defaultWeight: 0.25
  },
  lyrics: {
    type: 'lyrics',
    title: 'Lyrics',
    icon: 'lyrics',
    kind: 'widget',
    keepMounted: true,
    minSize: { w: 220 },
    defaultWeight: 0.25
  },
  'now-playing': {
    type: 'now-playing',
    title: 'Now Playing',
    icon: 'play_circle',
    kind: 'widget',
    minSize: { w: 200 },
    defaultWeight: 0.22
  },
  'track-info': {
    type: 'track-info',
    title: 'Track Info',
    icon: 'info',
    kind: 'widget',
    minSize: { w: 200 },
    defaultWeight: 0.2
  },
  visualizer: {
    type: 'visualizer',
    title: 'Visualizer',
    icon: 'graphic_eq',
    kind: 'widget',
    duplicate: true,
    minSize: { w: 150, h: 100 },
    defaultWeight: 0.2
  },
  empty: {
    type: 'empty',
    title: 'Empty Panel',
    icon: 'check_box_outline_blank',
    kind: 'widget',
    defaultWeight: 0.2
  }
};

export function getPanelDefinition(type: PanelType): PanelDefinition {
  return PANEL_DEFINITIONS[type] ?? PANEL_DEFINITIONS.empty;
}

export function isSingleton(type: PanelType): boolean {
  return Boolean(PANEL_DEFINITIONS[type]?.singleton);
}

export function shouldKeepMounted(type: PanelType): boolean {
  return Boolean(PANEL_DEFINITIONS[type]?.keepMounted);
}

export function canDuplicate(type: PanelType): boolean {
  return Boolean(PANEL_DEFINITIONS[type]?.duplicate);
}
