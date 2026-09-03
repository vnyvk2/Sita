import { useCallback } from 'react';

import { dndStore, workspaceActions } from '../store';
import type { DropEdge, DropTarget, NodeId, PanelInstanceId } from '../types';

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
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only initiate on primary button (left click)
      if (e.button !== 0) return;

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
        let foundTarget: DropTarget | null = null;

        for (const el of elements) {
          const targetNodeId = el.getAttribute('data-node-id');
          if (targetNodeId && targetNodeId !== sourceNodeId) {
            const rect = el.getBoundingClientRect();
            const edge = calculateDropEdge(rect, moveEv.clientX, moveEv.clientY);
            foundTarget = { nodeId: targetNodeId, edge };
            break;
          }
        }

        workspaceActions.setHoveredDropTarget(foundTarget);
      };

      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);

        if (hasStartedDrag) {
          const currentTarget = dndStore.state.hoveredDropTarget;
          if (currentTarget) {
            workspaceActions.dispatchOp({
              t: 'panel.move',
              panelId,
              target: currentTarget
            });
          }
          workspaceActions.setDragState(null);
        }
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    },
    [panelId, sourceNodeId]
  );

  return { handlePointerDown };
}
