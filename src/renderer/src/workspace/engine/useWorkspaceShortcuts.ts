import { useEffect } from 'react';

import { dndStore, workspaceActions, workspaceStore } from '../store';

export function useWorkspaceShortcuts(): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Guard: if e.target is an input element (input, textarea, select, or isContentEditable), return early
      const target = e.target as HTMLElement | null;
      if (target && typeof target === 'object') {
        const tagName = target.tagName?.toLowerCase();
        const isEditable =
          Boolean(target.isContentEditable) ||
          target.getAttribute?.('contenteditable') === 'true' ||
          target.getAttribute?.('contenteditable') === '' ||
          Boolean(target.closest?.('[contenteditable="true"], [contenteditable=""]'));
        if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || isEditable) {
          return;
        }
      }

      if (e.repeat) {
        return;
      }

      if (e.key === 'Escape') {
        const { maximizedPanelId, isSaveLayoutModalOpen } = dndStore.state;
        if (maximizedPanelId) {
          workspaceActions.setMaximizedPanel(null);
        }
        if (isSaveLayoutModalOpen) {
          workspaceActions.closeSaveLayoutModal();
        }
        return;
      }

      // CF-05: Toggle maximize panel shortcut (Ctrl+Alt+M or Cmd+Alt+M)
      if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        const { maximizedPanelId } = dndStore.state;
        if (maximizedPanelId) {
          workspaceActions.setMaximizedPanel(null);
        } else {
          const focusedPanelEl = (document.activeElement as HTMLElement | null)?.closest(
            '[data-panel-id]'
          );
          const focusedPanelId = focusedPanelEl?.getAttribute('data-panel-id');
          if (focusedPanelId) {
            workspaceActions.toggleMaximizePanel(focusedPanelId);
          } else {
            const activeWs = workspaceStore.state.workspaces[workspaceStore.state.active];
            const routerPanel =
              activeWs && Object.values(activeWs.panels).find((p) => p.type === 'router-view');
            if (routerPanel) {
              workspaceActions.toggleMaximizePanel(routerPanel.id);
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
