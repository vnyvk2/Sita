export type PanelKind = 'view' | 'widget';

export type PanelType =
  | 'navigation'
  | 'router-view'
  | 'queue'
  | 'playlists'
  | 'lyrics'
  | 'now-playing'
  | 'track-info'
  | 'visualizer'
  | 'empty';

export type PanelInstanceId = string;

export interface PanelInstance {
  id: PanelInstanceId;
  type: PanelType;
  /** Ephemeral UI state (e.g. scroll offsets, search query, active sub-tabs) */
  local: Record<string, unknown>;
}

export interface PanelRefNode {
  kind: 'panel';
  panel: PanelInstanceId;
}

export interface TabGroupNode {
  kind: 'tabs';
  id: string;
  tabs: PanelInstanceId[];
  active: PanelInstanceId;
}

export interface SplitNode {
  kind: 'split';
  id: string;
  axis: 'x' | 'y';
  children: LayoutNode[];
  weights: number[];
  collapsed?: number | null;
}

export type LayoutNode = PanelRefNode | TabGroupNode | SplitNode;

export interface WorkspaceFrameConfig {
  playerBar: 'top' | 'bottom';
  playerBarCompact: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  schemaVersion: number;
  root: LayoutNode;
  panels: Record<PanelInstanceId, PanelInstance>;
  frame: WorkspaceFrameConfig;
}

export interface WorkspaceState {
  active: string;
  workspaces: Record<string, Workspace>;
}

export type NodeId = string;
export type DropEdge = 'left' | 'right' | 'top' | 'bottom' | 'center';

export interface VisualDropTarget {
  nodeId: NodeId;
  edge: DropEdge;
}

export type DropTarget =
  | { k: 'edge'; splitId: string; index: number }
  | { k: 'split-into'; targetPanelId: PanelInstanceId; axis: 'x' | 'y'; before?: boolean }
  | { k: 'tab-into'; tabsId: string; index?: number };

export type LayoutOp =
  | { t: 'panel.insert'; type: PanelType; at: DropTarget }
  | { t: 'panel.move'; panelId: PanelInstanceId; at: DropTarget }
  | { t: 'panel.close'; panelId: PanelInstanceId }
  | { t: 'split.weights'; splitId: string; weights: number[] }
  | { t: 'split.collapse'; splitId: string; childIndex: number | null }
  | { t: 'tabs.activate'; tabsId: string; panelId: PanelInstanceId }
  | { t: 'tabs.reorder'; tabsId: string; order: PanelInstanceId[] }
  | { t: 'tabs.extract'; panelId: PanelInstanceId; axis: 'x' | 'y' }
  | { t: 'ws.create'; name: string; preset?: Workspace }
  | { t: 'ws.switch'; id: string }
  | { t: 'ws.duplicate'; id: string; newName: string }
  | { t: 'ws.rename'; id: string; name: string }
  | { t: 'ws.delete'; id: string }
  | { t: 'ws.reset'; id: string; defaultPreset: Workspace };
