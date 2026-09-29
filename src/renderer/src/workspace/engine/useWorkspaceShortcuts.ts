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
        const { maximizedPanelId, isSaveLayoutModalOpen, isDeleteConfirmModalOpen } =
          dndStore.state;
        if (maximizedPanelId) {
          workspaceActions.setMaximizedPanel(null);
        }
        if (isSaveLayoutModalOpen) {
          workspaceActions.closeSaveLayoutModal();
        }
        if (isDeleteConfirmModalOpen) {
          workspaceActions.closeDeleteConfirmModal();
        }
        return;
      }

      // Undo: Ctrl+Z / Cmd+Z (without Alt, without Shift)
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        !e.shiftKey &&
        (e.key === 'z' || e.key === 'Z')
      ) {
        e.preventDefault();
        workspaceActions.undo();
        return;
      }

      // Redo: Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y / Cmd+Y
      if (
        ((e.ctrlKey || e.metaKey) && !e.altKey && e.shiftKey && (e.key === 'z' || e.key === 'Z')) ||
        ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'y' || e.key === 'Y'))
      ) {
        e.preventDefault();
        workspaceActions.redo();
        return;
      }

      // Switch workspace by index: Ctrl+1..9 / Cmd+1..9
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
        const digitMatch = e.code.match(/^Digit([1-9])$/) || e.key.match(/^([1-9])$/);
        if (digitMatch) {
          const index = parseInt(digitMatch[1], 10) - 1;
          const workspaceIds = Object.keys(workspaceStore.state.workspaces);
          if (index >= 0 && index < workspaceIds.length) {
            e.preventDefault();
            workspaceActions.switchWorkspace(workspaceIds[index]);
            return;
          }
        }
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
