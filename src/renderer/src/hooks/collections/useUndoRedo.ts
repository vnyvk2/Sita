import { useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CollectionClient } from '../../api/CollectionClient';
import { store } from '../../store/store';

export const useUndoRedo = () => {
  const undoMutation = useMutation({
    mutationFn: (collectionId: string) => CollectionClient.undo(collectionId),
  });

  const redoMutation = useMutation({
    mutationFn: (collectionId: string) => CollectionClient.redo(collectionId),
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore in mini player mode: undo/redo belongs to the collection editor surfaces of the
      // main player, and a stray Ctrl+Z/Y must never mutate playlist state from the mini window.
      // Read directly from the store to avoid re-registering this listener on state changes.
      if (store.state.playerType === 'mini') {
        return;
      }

      // Ignore if user is typing in an input
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        (document.activeElement as HTMLElement).isContentEditable
      ) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (cmdOrCtrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        
        if (e.shiftKey) {
          // Redo: Ctrl+Shift+Z or Cmd+Shift+Z
          // We pass 'global' or empty string since undo/redo is global for now,
          // but if we need a specific context later, we can adjust.
          redoMutation.mutate('local://playlist/0');
        } else {
          // Undo: Ctrl+Z or Cmd+Z
          undoMutation.mutate('local://playlist/0');
        }
      } else if (cmdOrCtrl && e.key.toLowerCase() === 'y' && !isMac) {
        // Redo: Ctrl+Y (Windows/Linux)
        e.preventDefault();
        redoMutation.mutate('local://playlist/0');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [undoMutation, redoMutation]);

  return {
    undo: () => undoMutation.mutate('local://playlist/0'),
    redo: () => redoMutation.mutate('local://playlist/0'),
    isUndoing: undoMutation.isPending,
    isRedoing: redoMutation.isPending,
  };
};
