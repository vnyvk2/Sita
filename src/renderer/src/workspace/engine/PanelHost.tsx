import { useStore } from '@tanstack/react-store';
import { memo, Suspense, useMemo, type FC } from 'react';

import { getPanelDefinition } from '../registry';
import type { PanelApi } from '../registry';
import { workspaceActions, workspaceStore } from '../store';
import type { PanelInstanceId } from '../types';
import { PanelErrorBoundary } from './PanelErrorBoundary';
import { PanelFrame } from './PanelFrame';
import { PanelSkeleton } from './PanelSkeleton';

interface PanelHostProps {
  panelId: PanelInstanceId;
  showHeader?: boolean;
}

export const PanelHost: FC<PanelHostProps> = memo(({ panelId, showHeader = true }) => {
  const instance = useStore(
    workspaceStore,
    (state) => state.workspaces[state.active]?.panels[panelId]
  );

  const def = instance ? getPanelDefinition(instance.type) : null;

  const api: PanelApi = useMemo(
    () => ({
      instanceId: panelId,
      type: instance?.type ?? 'empty',
      setLocal: <T,>(key: string, value: T | ((prev: T) => T)) => {
        workspaceActions.updatePanelLocal(panelId, key, value);
      },
      getLocal: <T,>(key: string, defaultValue: T): T => {
        return (instance?.local[key] as T) ?? defaultValue;
      },
      close: () => {
        workspaceActions.dispatchOp({ t: 'panel.close', panelId });
      },
      maximize: () => {
        workspaceActions.toggleMaximizePanel(panelId);
      }
    }),
    [panelId, instance?.type, instance?.local]
  );

  if (!instance || !def) {
    return (
      <div className="text-font-color-dimmed flex h-full w-full items-center justify-center p-4 text-xs">
        Panel &apos;{panelId}&apos; not found
      </div>
    );
  }

  const Component = def.component;

  return (
    <PanelFrame
      panelId={panelId}
      type={instance.type}
      title={def.title}
      icon={def.icon}
      canClose={instance.type !== 'router-view'}
      showHeader={showHeader}
    >
      <PanelErrorBoundary
        panelId={panelId}
        panelTitle={def.title}
        canClose={instance.type !== 'router-view'}
        onClose={() => workspaceActions.dispatchOp({ t: 'panel.close', panelId })}
      >
        <Suspense fallback={<PanelSkeleton title={def.title} />}>
          {Component ? (
            <Component instance={instance} api={api} />
          ) : (
            <div className="text-font-color-dimmed flex h-full w-full flex-col items-center justify-center p-6 text-center">
              <span className="material-symbols-rounded mb-2 text-3xl">{def.icon}</span>
              <span className="text-xs font-semibold">{def.title}</span>
              <span className="text-font-color-dimmed/70 mt-1 text-[10px]">Widget Ready</span>
            </div>
          )}
        </Suspense>
      </PanelErrorBoundary>
    </PanelFrame>
  );
});

PanelHost.displayName = 'PanelHost';
