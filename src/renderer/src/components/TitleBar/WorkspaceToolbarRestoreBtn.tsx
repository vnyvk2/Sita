import { useStore } from '@tanstack/react-store';
import { dndStore, workspaceActions, workspaceStore } from '@renderer/workspace/store';
import { memo } from 'react';

const WorkspaceToolbarRestoreBtn = memo(() => {
  const isToolbarCollapsed = useStore(dndStore, (s) => s.isToolbarCollapsed);
  const activeWorkspaceId = useStore(workspaceStore, (s) => s.active);
  const workspaces = useStore(workspaceStore, (s) => s.workspaces);
  const activeWorkspace = workspaces[activeWorkspaceId];

  if (!isToolbarCollapsed) return null;

  return (
    <button
      type="button"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      onClick={() => workspaceActions.setToolbarCollapsed(false)}
      title={`Show Workspace Toolbar (${activeWorkspace?.name ?? 'Workspace'})`}
      className="workspace-toolbar-restore-btn app-region-no-drag hover:bg-background-color-2 hover:text-font-color-highlight dark:hover:bg-dark-background-color-2 dark:hover:text-font-color-highlight !mr-2 flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-stone-200/60 px-2 py-0.5 text-xs font-semibold shadow-2xs backdrop-blur-md transition-all hover:scale-105 dark:border-stone-700/60"
    >
      <span className="material-symbols-rounded text-accent text-base leading-none">
        view_quilt
      </span>
      <span className="max-w-[100px] truncate text-[11px]">
        {activeWorkspace?.name ?? 'Workspace'}
      </span>
      <span className="material-symbols-rounded text-font-color-dimmed text-xs opacity-70">
        expand_more
      </span>
    </button>
  );
});

WorkspaceToolbarRestoreBtn.displayName = 'WorkspaceToolbarRestoreBtn';
export default WorkspaceToolbarRestoreBtn;
