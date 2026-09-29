import { useStore } from '@tanstack/react-store';
import { memo, useEffect, useRef, type FC } from 'react';

import { DEFAULT_PRESET } from '../presets/default';
import { dndStore, workspaceActions, workspaceStore } from '../store';

interface ConfirmDeleteModalContentProps {
  targetWorkspaceId: string;
}

const ConfirmDeleteModalContent: FC<ConfirmDeleteModalContentProps> = memo(
  ({ targetWorkspaceId }) => {
    const workspaces = useStore(workspaceStore, (s) => s.workspaces);
    const activeId = useStore(workspaceStore, (s) => s.active);
    const dialogRef = useRef<HTMLDivElement>(null);
    const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
    const deleteButtonRef = useRef<HTMLButtonElement>(null);

    const targetWs = workspaces[targetWorkspaceId];
    const isDeletingActive = activeId === targetWorkspaceId;

    useEffect(() => {
      previouslyFocusedElementRef.current = document.activeElement as HTMLElement | null;
      if (deleteButtonRef.current) {
        deleteButtonRef.current.focus();
      }
      return () => {
        previouslyFocusedElementRef.current?.focus();
      };
    }, []);

    const handleClose = () => {
      workspaceActions.closeDeleteConfirmModal();
    };

    const handleConfirmDelete = () => {
      workspaceActions.deleteWorkspace(targetWorkspaceId);
      workspaceActions.closeDeleteConfirmModal();
    };

    useEffect(() => {
      const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          handleClose();
          return;
        }

        if (e.key === 'Tab' && dialogRef.current) {
          const focusable = Array.from(
            dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled])')
          );
          if (focusable.length === 0) return;

          const first = focusable[0];
          const last = focusable[focusable.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === first) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      };

      window.addEventListener('keydown', handleGlobalKeyDown);
      return () => {
        window.removeEventListener('keydown', handleGlobalKeyDown);
      };
    }, []);

    if (!targetWs) return null;

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            handleClose();
          }
        }}
        role="presentation"
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-delete-modal-title"
          aria-describedby="confirm-delete-modal-desc"
          className="bg-background-color-1 dark:bg-dark-background-color-1 text-font-color-black dark:text-font-color-white flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-stone-200 p-5 shadow-2xl dark:border-stone-800"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-rounded text-xl text-rose-500">delete_forever</span>
              <h3 id="confirm-delete-modal-title" className="text-base font-bold">
                Delete Workspace
              </h3>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              className="text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-stone-200/60 dark:hover:bg-stone-800/60"
            >
              <span className="material-symbols-rounded text-lg">close</span>
            </button>
          </div>

          {/* Body */}
          <div id="confirm-delete-modal-desc" className="flex flex-col gap-2 text-xs">
            <p className="text-font-color-dimmed leading-relaxed">
              Are you sure you want to delete{' '}
              <strong className="text-font-color-black dark:text-font-color-white font-semibold">
                &ldquo;{targetWs.name}&rdquo;
              </strong>
              ? This action cannot be undone.
            </p>
            {isDeletingActive && (
              <p className="rounded-lg bg-amber-500/10 p-2 text-amber-700 dark:text-amber-400">
                This is your currently active layout. Nora will switch to the{' '}
                <strong className="font-semibold">&ldquo;{DEFAULT_PRESET.name}&rdquo;</strong>{' '}
                preset.
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white cursor-pointer rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors hover:bg-stone-200/60 dark:hover:bg-stone-800/60"
            >
              Cancel
            </button>
            <button
              ref={deleteButtonRef}
              type="button"
              onClick={handleConfirmDelete}
              className="cursor-pointer rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-rose-700 hover:shadow-md active:opacity-90"
            >
              Delete Layout
            </button>
          </div>
        </div>
      </div>
    );
  }
);

ConfirmDeleteModalContent.displayName = 'ConfirmDeleteModalContent';

export const ConfirmDeleteModal: FC = memo(() => {
  const isOpen = useStore(dndStore, (s) => s.isDeleteConfirmModalOpen);
  const targetWorkspaceId = useStore(dndStore, (s) => s.deleteTargetWorkspaceId);

  if (!isOpen || !targetWorkspaceId) return null;

  return (
    <ConfirmDeleteModalContent
      key={`delete-${targetWorkspaceId}`}
      targetWorkspaceId={targetWorkspaceId}
    />
  );
});

ConfirmDeleteModal.displayName = 'ConfirmDeleteModal';

export default ConfirmDeleteModal;
