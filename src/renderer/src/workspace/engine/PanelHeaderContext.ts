import { createContext, type ReactNode } from 'react';

export interface PanelMenuContribution {
  label: string;
  icon?: string;
  handler: () => void;
}

export interface PanelHeaderFragment {
  /** Truncatable context: track title, counts. Rendered after the panel title. */
  info?: ReactNode;
  /** Right-aligned controls. Keep to <= 2 visible; rest goes in the menu. */
  actions?: ReactNode;
  /** Extra items for the header context menu. Evaluated at open time -> always fresh. */
  menu?: () => PanelMenuContribution[];
}

/** Provided by PanelFrame; consumed by PanelHeaderSlot inside the panel. */
export const PanelHeaderSetterContext = createContext<
  ((fragment: PanelHeaderFragment | null) => void) | null
>(null);

/** Provided by TabGroup; consumed by PanelFrame for tab-mode portal rendering. */
export interface TabActionsTarget {
  target: HTMLElement | null;
  activePanelId: string | null;
}

export const TabActionsContext = createContext<TabActionsTarget>({
  target: null,
  activePanelId: null
});
