import { useStore } from '@tanstack/react-store';
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type FormEvent
} from 'react';

import { dndStore, workspaceActions, workspaceStore } from '../store';

interface SaveLayoutModalContentProps {
  mode: 'save' | 'rename';
  targetWorkspaceId: string | null;
}

const SaveLayoutModalContent: FC<SaveLayoutModalContentProps> = memo(
  ({ mode, targetWorkspaceId }) => {
    const workspaces = useStore(workspaceStore, (s) => s.workspaces);
    const activeId = useStore(workspaceStore, (s) => s.active);
    const inputRef = useRef<HTMLInputElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

    const initialName = useMemo(() => {
      if (mode === 'rename') {
        const targetWs = targetWorkspaceId ? workspaces[targetWorkspaceId] : workspaces[activeId];
        return targetWs?.name ?? '';
      }
      const activeWs = workspaces[activeId];
      if (activeWs) {
        return activeWs.name.endsWith('(Custom)')
          ? `${activeWs.name} Copy`
          : `${activeWs.name} (Custom)`;
      }
      return `Layout ${Object.keys(workspaces).length + 1}`;
    }, [mode, targetWorkspaceId, activeId, workspaces]);

    const [name, setName] = useState(initialName);

    useEffect(() => {
      previouslyFocusedElementRef.current = document.activeElement as HTMLElement | null;
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
      return () => {
        previouslyFocusedElementRef.current?.focus();
      };
    }, []);

    const handleClose = () => {
      workspaceActions.closeSaveLayoutModal();
    };

    const handleSubmit = (e: FormEvent) => {
      e.preventDefault();
      const trimmed = name.trim();
      if (!trimmed) return;

      if (mode === 'save') {
        workspaceActions.saveCurrentLayoutAs(trimmed);
      } else if (mode === 'rename' && targetWorkspaceId) {
        workspaceActions.renameWorkspace(targetWorkspaceId, trimmed);
      }
      workspaceActions.closeSaveLayoutModal();
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
            dialogRef.current.querySelectorAll<HTMLElement>(
              'button:not([disabled]), input:not([disabled])'
            )
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

    const title = mode === 'rename' ? 'Rename Layout' : 'Save Custom Layout';
    const icon = mode === 'rename' ? 'edit' : 'bookmark_add';
    const actionButtonText = mode === 'rename' ? 'Rename' : 'Save';

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
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
          aria-labelledby="save-layout-modal-title"
          className="bg-background-color-1 dark:bg-dark-background-color-1 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl p-5 w-full max-w-sm flex flex-col gap-4 text-font-color-black dark:text-font-color-white"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-rounded text-accent text-xl">{icon}</span>
              <h3 id="save-layout-modal-title" className="text-base font-bold">
                {title}
              </h3>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              className="text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-stone-200/60 dark:hover:bg-stone-800/60 cursor-pointer"
            >
              <span className="material-symbols-rounded text-lg">close</span>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="workspace-layout-name-input" className="sr-only">
                Layout Name
              </label>
              <input
                ref={inputRef}
                id="workspace-layout-name-input"
                type="text"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Studio Layout, Lyrics Focus..."
                className="w-full rounded-xl border border-stone-300 bg-stone-100/70 px-3.5 py-2 text-sm text-font-color-black placeholder:text-font-color-dimmed focus:border-accent focus:outline-hidden focus:ring-1 focus:ring-accent dark:border-stone-700 dark:bg-stone-800/70 dark:text-font-color-white transition-colors"
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-xl px-3.5 py-2 text-xs font-semibold text-font-color-dimmed hover:bg-stone-200/60 hover:text-font-color-black dark:hover:bg-stone-800/60 dark:hover:text-font-color-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim()}
                className="rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {actionButtonText}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }
);

SaveLayoutModalContent.displayName = 'SaveLayoutModalContent';

export const SaveLayoutModal: FC = memo(() => {
  const isOpen = useStore(dndStore, (s) => s.isSaveLayoutModalOpen);
  const mode = useStore(dndStore, (s) => s.saveLayoutModalMode);
  const targetWorkspaceId = useStore(dndStore, (s) => s.targetWorkspaceId);

  if (!isOpen) return null;

  return (
    <SaveLayoutModalContent
      key={`${mode}-${targetWorkspaceId ?? 'active'}`}
      mode={mode}
      targetWorkspaceId={targetWorkspaceId}
    />
  );
});

SaveLayoutModal.displayName = 'SaveLayoutModal';

export default SaveLayoutModal;
