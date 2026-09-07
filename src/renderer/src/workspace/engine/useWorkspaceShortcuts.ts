import { useEffect } from 'react';

import { dndStore, workspaceActions } from '../store';

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
        if (
          tagName === 'input' ||
          tagName === 'textarea' ||
          tagName === 'select' ||
          isEditable
        ) {
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
