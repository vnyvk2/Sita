import { useCallback, useEffect, useRef } from 'react';

import { dndStore, workspaceActions } from '../store';
import type { DropEdge, DropTarget, NodeId, PanelInstanceId, VisualDropTarget } from '../types';

export function calculateDropEdge(rect: DOMRect, clientX: number, clientY: number): DropEdge {
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;

  if (x < 0.22) return 'left';
  if (x > 0.78) return 'right';
  if (y < 0.22) return 'top';
  if (y > 0.78) return 'bottom';
  return 'center';
}

export function usePanelDragDrop(panelId: PanelInstanceId, sourceNodeId?: NodeId) {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only initiate on primary button (left click)
      if (e.button !== 0) return;

      cleanupRef.current?.();

      const startX = e.clientX;
      const startY = e.clientY;
      let hasStartedDrag = false;

      const onPointerMove = (moveEv: PointerEvent) => {
        const dx = moveEv.clientX - startX;
        const dy = moveEv.clientY - startY;

        // 5px threshold to avoid false positives during clicks
        if (!hasStartedDrag) {
          if (Math.hypot(dx, dy) > 5) {
            hasStartedDrag = true;
            workspaceActions.setDragState({ panelId, sourceNodeId });
          } else {
            return;
          }
        }

        // Hit-test element under pointer
        const elements =
          typeof document.elementsFromPoint === 'function'
            ? document.elementsFromPoint(moveEv.clientX, moveEv.clientY)
            : [];
        let foundTarget: VisualDropTarget | null = null;

        for (const el of elements) {
          const targetNodeId = el.getAttribute('data-node-id');
          if (!targetNodeId || targetNodeId === panelId) {
            continue;
          }
          const rect = el.getBoundingClientRect();
          const edge = calculateDropEdge(rect, moveEv.clientX, moveEv.clientY);
          // If target is the same tab group we are dragging from, disallow center tab-into
          if (targetNodeId === sourceNodeId && edge === 'center') {
            continue;
          }
          foundTarget = { nodeId: targetNodeId, edge };
          break;
        }

        const current = dndStore.state.hoveredDropTarget;
        if (!foundTarget && !current) {
          return;
        }
        if (foundTarget?.nodeId === current?.nodeId && foundTarget?.edge === current?.edge) {
          return;
        }

        workspaceActions.setHoveredDropTarget(foundTarget);
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerCancel);
        window.removeEventListener('blur', onBlur);
        cleanupRef.current = null;
      };

      const cancelDrag = () => {
        cleanup();
        if (hasStartedDrag) {
          workspaceActions.setDragState(null);
        }
      };

      const onPointerCancel = cancelDrag;
      const onBlur = cancelDrag;

      const onPointerUp = () => {
        cleanup();

        if (hasStartedDrag) {
          try {
            const currentTarget = dndStore.state.hoveredDropTarget;
            if (currentTarget) {
              let at: DropTarget;
              if (currentTarget.edge === 'center') {
                at = { k: 'tab-into', tabsId: currentTarget.nodeId };
              } else if (currentTarget.edge === 'left') {
                at = {
                  k: 'split-into',
                  targetPanelId: currentTarget.nodeId,
                  axis: 'x',
                  before: true
                };
              } else if (currentTarget.edge === 'right') {
                at = {
                  k: 'split-into',
                  targetPanelId: currentTarget.nodeId,
                  axis: 'x',
                  before: false
                };
              } else if (currentTarget.edge === 'top') {
                at = {
                  k: 'split-into',
                  targetPanelId: currentTarget.nodeId,
                  axis: 'y',
                  before: true
                };
              } else {
                at = {
                  k: 'split-into',
                  targetPanelId: currentTarget.nodeId,
                  axis: 'y',
                  before: false
                };
              }
              workspaceActions.dispatchOp({
                t: 'panel.move',
                panelId,
                at
              });
            }
          } finally {
            workspaceActions.setDragState(null);
          }
        }
      };

      cleanupRef.current = cancelDrag;

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerCancel);
      window.addEventListener('blur', onBlur);
    },
    [panelId, sourceNodeId]
  );

  return { handlePointerDown };
}
